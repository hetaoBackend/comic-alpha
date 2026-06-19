import os
import requests
import logging
import time
import uuid
import io
import base64
import json

from dotenv import load_dotenv
from typing import Optional
from google import genai
from google.genai.types import GenerateContentConfig, ImageConfig, FinishReason
from openai import OpenAI
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)
load_dotenv()

CODEX_RESPONSES_BASE_URL = "https://chatgpt.com/backend-api/codex"
CODEX_IMAGE_RESPONSES_MODEL = "gpt-5.5"
CODEX_IMAGE_INSTRUCTIONS = "You are an image generation assistant."


def _env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        logger.warning("Invalid %s value; using default %s", name, default)
        return default


CODEX_REFERENCE_MAX_SIDE = _env_int("CODEX_REFERENCE_MAX_SIDE", 768)


def _load_reference_image_for_openai(
        img_str: str,
        index: int,
        max_side: Optional[int] = None
    ) -> Optional[io.BytesIO]:
    """Load any supported reference image into a named PNG byte stream."""
    try:
        if img_str.startswith('http'):
            logger.info(f"Downloading OpenAI reference image: {img_str}")
            resp = requests.get(img_str, timeout=60)
            resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content))
        elif img_str.startswith("/backend/static/images/"):
            logger.info(f"Loading OpenAI generated-page reference: {img_str}")
            filename = img_str.replace("/backend/static/images/", "")
            image_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images", filename)
            img = Image.open(image_path)
        elif os.path.isabs(img_str) and os.path.isfile(img_str):
            logger.info(f"Loading OpenAI local reference image: {img_str}")
            img = Image.open(img_str)
        elif img_str.startswith('data:image'):
            logger.info("Loading OpenAI base64 reference image")
            encoded = img_str.split(",", 1)[1] if "," in img_str else img_str
            data = base64.b64decode(encoded)
            img = Image.open(io.BytesIO(data))
        else:
            logger.warning(f"Unsupported OpenAI reference image input: {img_str[:50]}...")
            return None

        img = ImageOps.exif_transpose(img)
        original_size = img.size
        if max_side and max(img.size) > max_side:
            img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            logger.info("Resized reference image %s from %s to %s", index, original_size, img.size)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        buffer.name = f"reference_{index}.png"
        return buffer
    except Exception as e:
        logger.warning(f"Failed to process OpenAI reference image {img_str[:50]}...: {e}")
        return None


def _generated_image_to_png_bytes(generated_image) -> bytes:
    """Convert SDK/PIL generated images into PNG bytes."""
    if getattr(generated_image, "image_bytes", None):
        return generated_image.image_bytes

    buffer = io.BytesIO()
    try:
        generated_image.save(buffer, format="PNG")
    except TypeError as exc:
        if "format" not in str(exc):
            raise
        buffer = io.BytesIO()
        generated_image.save(buffer, image_format="PNG")
    return buffer.getvalue()


def _collect_openai_reference_images(
        reference_img: Optional[str | list],
        max_side: Optional[int] = None
    ) -> list[io.BytesIO]:
    image_urls = []
    if reference_img:
        if isinstance(reference_img, list):
            for img in reference_img:
                if isinstance(img, dict) and 'imageUrl' in img:
                    image_urls.append(img['imageUrl'])
                elif isinstance(img, str):
                    image_urls.append(img)
        elif isinstance(reference_img, str):
            image_urls.append(reference_img)

    references = []
    for index, img_str in enumerate(image_urls, 1):
        image_file = _load_reference_image_for_openai(img_str, index, max_side=max_side)
        if image_file:
            references.append(image_file)
    return references


def _resolve_codex_access_token() -> str:
    env_token = os.getenv("CODEX_ACCESS_TOKEN") or os.getenv("OPENAI_CODEX_ACCESS_TOKEN")
    if env_token and env_token.strip():
        return env_token.strip()

    auth_path = os.path.expanduser(os.getenv("CODEX_AUTH_FILE", "~/.codex/auth.json"))
    if not os.path.exists(auth_path):
        raise ValueError("Codex credential not found. Please sign in to Codex or set CODEX_ACCESS_TOKEN.")

    try:
        import json

        with open(auth_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        raise ValueError(f"Failed to read Codex credential: {e}") from e

    token = (payload.get("tokens") or {}).get("access_token")
    if not token:
        raise ValueError("Codex access token missing. Please sign in to Codex again.")
    return token


def _codex_response_error(event: dict, fallback: str) -> Optional[str]:
    if event.get("type") not in ["response.failed", "error"]:
        return None

    error = event.get("error") or {}
    return error.get("message") or event.get("message") or fallback


def _raise_for_codex_status(response: requests.Response, action: str) -> None:
    if response.status_code < 400:
        return

    if response.status_code == 401:
        raise ValueError("Codex credential expired or unauthorized. Please sign in to Codex again.")

    detail = response.text.strip()
    try:
        payload = response.json()
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict):
            detail = error.get("message") or error.get("code") or detail
        elif isinstance(payload, dict):
            detail = payload.get("message") or payload.get("detail") or detail
    except Exception:
        pass

    if len(detail) > 600:
        detail = detail[:600] + "..."

    raise ValueError(f"{action} failed with HTTP {response.status_code}: {detail}")


def _extract_text_from_response_output(output: list) -> str:
    chunks = []
    for item in output or []:
        if item.get("type") == "message":
            for part in item.get("content") or []:
                if part.get("type") in ["output_text", "text"] and part.get("text"):
                    chunks.append(part["text"])
        elif item.get("type") in ["output_text", "text"] and item.get("text"):
            chunks.append(item["text"])
    return "".join(chunks).strip()


def _extract_codex_text_from_sse(body: str) -> str:
    text_chunks = []
    completed_output = []

    for raw_line in body.splitlines():
        if not raw_line.startswith("data: "):
            continue

        data = raw_line[6:].strip()
        if not data or data == "[DONE]":
            continue

        try:
            event = json.loads(data)
        except Exception:
            continue

        error_message = _codex_response_error(event, "OpenAI Codex text generation failed")
        if error_message:
            raise ValueError(error_message)

        event_type = event.get("type")
        if event_type == "response.output_text.delta" and event.get("delta"):
            text_chunks.append(event["delta"])
        elif event_type == "response.output_text.done" and event.get("text"):
            text_chunks = [event["text"]]

        response = event.get("response") or {}
        if event_type == "response.completed" and response.get("output"):
            completed_output = response["output"]

        item = event.get("item") or {}
        if event_type == "response.output_item.done" and item.get("type") == "message":
            item_text = _extract_text_from_response_output([item])
            if item_text:
                text_chunks = [item_text]

    completed_text = _extract_text_from_response_output(completed_output)
    if completed_text:
        return completed_text

    text = "".join(text_chunks).strip()
    if not text:
        raise ValueError("OpenAI Codex text generation response missing text")
    return text


def generate_codex_text_core(
        system_prompt: str,
        user_prompt: str,
        model: str = "gpt-5.5",
        reasoning_effort: str = "medium",
        json_mode: bool = False,
        max_retries: int = 2,
        retry_delay: float = 1.0
    ) -> str:
    access_token = _resolve_codex_access_token()
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    input_text = user_prompt
    if json_mode:
        input_text = (
            "Return JSON only. Do not include markdown fences or explanatory text.\n\n"
            + user_prompt
        )
    body = {
        "model": model,
        "instructions": system_prompt,
        "input": [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": input_text}],
            }
        ],
        "reasoning": {"effort": reasoning_effort},
        "stream": True,
        "store": False,
    }
    if json_mode:
        body["text"] = {"format": {"type": "json_object"}}

    url = f"{CODEX_RESPONSES_BASE_URL}/responses"
    last_exception = None

    for attempt in range(max_retries):
        try:
            logger.info(f"Calling Codex text route with {model} (Attempt {attempt + 1}/{max_retries})")
            response = requests.post(url, headers=headers, json=body, timeout=180)
            _raise_for_codex_status(response, "Codex text generation")
            return _extract_codex_text_from_sse(response.text)
        except Exception as e:
            last_exception = e
            logger.warning(f"Codex text attempt {attempt + 1}/{max_retries} failed: {str(e)}")

            if json_mode and attempt == 0 and "json_object" in str(e):
                body.pop("text", None)

            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)
                logger.info(f"Retrying Codex text generation in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                logger.error("All Codex text generation attempts failed")
                raise last_exception

    raise ValueError("OpenAI Codex text generation failed")


def _image_streams_to_codex_input(reference_images: list[io.BytesIO]) -> list[dict]:
    content = []
    for image_file in reference_images:
        image_file.seek(0)
        encoded = base64.b64encode(image_file.read()).decode("utf-8")
        image_file.seek(0)
        content.append({
            "type": "input_image",
            "image_url": f"data:image/png;base64,{encoded}",
            "detail": "auto",
        })
    return content


def _extract_codex_image_from_sse(body: str) -> bytes:
    completed_output = []
    for raw_line in body.splitlines():
        if not raw_line.startswith("data: "):
            continue

        data = raw_line[6:].strip()
        if not data or data == "[DONE]":
            continue

        try:
            event = json.loads(data)
        except Exception:
            continue

        error_message = _codex_response_error(event, "OpenAI Codex image generation failed")
        if error_message:
            raise ValueError(error_message)

        item = event.get("item") or {}
        if (
            event.get("type") == "response.output_item.done"
            and item.get("type") == "image_generation_call"
            and item.get("result")
        ):
            return base64.b64decode(item["result"])

        response = event.get("response") or {}
        if event.get("type") == "response.completed" and response.get("output"):
            completed_output = response["output"]

    for item in completed_output:
        if item.get("type") == "image_generation_call" and item.get("result"):
            return base64.b64decode(item["result"])

    raise ValueError("OpenAI Codex image generation response missing image data")


def generate_codex_image_core(
        prompt: str,
        reference_img: Optional[str | list] = None,
        model: str = "gpt-image-2",
        size: str = "1024x1536",
        quality: str = "medium",
        reasoning_effort: str = "medium",
        max_retries: int = 3,
        retry_delay: float = 1.0
    ) -> Optional[str]:
    access_token = _resolve_codex_access_token()
    reference_images = _collect_openai_reference_images(reference_img, max_side=CODEX_REFERENCE_MAX_SIDE)
    content = [
        {"type": "input_text", "text": prompt},
        *_image_streams_to_codex_input(reference_images),
    ]
    tool = {
        "type": "image_generation",
        "model": model,
        "size": size,
    }
    if quality:
        tool["quality"] = quality

    body = {
        "model": CODEX_IMAGE_RESPONSES_MODEL,
        "input": [{"role": "user", "content": content}],
        "instructions": CODEX_IMAGE_INSTRUCTIONS,
        "tools": [tool],
        "tool_choice": {"type": "image_generation"},
        "reasoning": {"effort": reasoning_effort},
        "stream": True,
        "store": False,
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    url = f"{CODEX_RESPONSES_BASE_URL}/responses"
    last_exception = None

    for attempt in range(max_retries):
        try:
            logger.info(f"Calling Codex image route with {model} (Attempt {attempt + 1}/{max_retries})")
            response = requests.post(url, headers=headers, json=body, timeout=180)
            _raise_for_codex_status(response, "Codex image generation")
            image_bytes = _extract_codex_image_from_sse(response.text)
            return _save_generated_image(image_bytes)
        except Exception as e:
            last_exception = e
            logger.warning(f"Codex image attempt {attempt + 1}/{max_retries} failed: {str(e)}")

            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)
                logger.info(f"Retrying Codex image generation in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                logger.error("All Codex image generation attempts failed")
                raise last_exception

    return None


def _save_generated_image(image_bytes: bytes) -> str:
    filename = f"{uuid.uuid4()}.png"
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, "static", "images")
    os.makedirs(static_dir, exist_ok=True)

    save_path = os.path.join(static_dir, filename)
    with open(save_path, "wb") as f:
        f.write(image_bytes)
    logger.info(f"Image saved to {save_path}")

    return f"/backend/static/images/{filename}"


def generate_openai_image_core(
        prompt: str,
        reference_img: Optional[str | list] = None,
        api_key: Optional[str] = None,
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-image-2",
        size: str = "1024x1536",
        quality: str = "medium",
        max_retries: int = 3,
        retry_delay: float = 1.0
    ) -> Optional[str]:
    api_key = api_key or os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise ValueError("OpenAI API key is required. Please provide api_key parameter or set OPENAI_API_KEY environment variable.")

    client = OpenAI(api_key=api_key, base_url=base_url)
    reference_images = _collect_openai_reference_images(reference_img)
    last_exception = None

    for attempt in range(max_retries):
        try:
            logger.info(f"Calling OpenAI image API with {model} (Attempt {attempt + 1}/{max_retries})")
            request = {
                "model": model,
                "prompt": prompt,
                "size": size,
                "quality": quality,
            }

            if reference_images:
                response = client.images.edit(
                    image=reference_images if len(reference_images) > 1 else reference_images[0],
                    **request
                )
            else:
                response = client.images.generate(**request)

            image_data = response.data[0]
            if getattr(image_data, "b64_json", None):
                image_bytes = base64.b64decode(image_data.b64_json)
            elif getattr(image_data, "url", None):
                image_resp = requests.get(image_data.url, timeout=60)
                image_resp.raise_for_status()
                image_bytes = image_resp.content
            else:
                raise ValueError("No image data returned by OpenAI API")

            return _save_generated_image(image_bytes)
        except Exception as e:
            last_exception = e
            logger.warning(f"OpenAI image attempt {attempt + 1}/{max_retries} failed: {str(e)}")

            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)
                logger.info(f"Retrying OpenAI image generation in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                logger.error("All OpenAI image generation attempts failed")
                raise last_exception

    return None


def generate_social_media_image_core(
        prompt: str, 
        reference_img: Optional[str | list] = None,
        google_api_key: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ) -> Optional[str]:
    
    # Initialize Google GenAI Client
    # Use provided API key or fall back to environment variable
    api_key = google_api_key or os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise ValueError("Google API key is required. Please provide google_api_key parameter or set GOOGLE_API_KEY environment variable.")
    
    client = genai.Client(api_key=api_key, vertexai=False, http_options={'timeout':180000})
    MODEL_ID = "gemini-3.1-flash-image-preview"
    
    logger.info(f"Generating social media image for: {prompt}")
    
    # Prepare contents
    contents = [prompt]
    
    # Handle reference images
    if reference_img:
        image_urls = []
        if isinstance(reference_img, list):
            for img in reference_img:
                if isinstance(img, dict) and 'imageUrl' in img:
                    image_urls.append(img['imageUrl'])
                elif isinstance(img, str):
                    image_urls.append(img)
        elif isinstance(reference_img, str):
            image_urls.append(reference_img)
            
        for img_str in image_urls:
            try:
                if img_str.startswith('http'):
                    logger.info(f"Downloading reference image: {img_str}")
                    resp = requests.get(img_str, timeout=60)
                    resp.raise_for_status()
                    img = Image.open(io.BytesIO(resp.content))
                    contents.append(img)
                elif img_str.startswith("/backend/static/images/"):
                    logger.info(f"Processing reference image: {img_str}")
                    img_str = img_str.replace("/backend/", "")
                    img = Image.open(f"{os.getcwd()}/{img_str}")
                    contents.append(img)
                elif os.path.isabs(img_str) and os.path.isfile(img_str):
                    # Handle local absolute file paths (e.g., character reference images)
                    logger.info(f"Loading local reference image: {img_str}")
                    img = Image.open(img_str)
                    contents.append(img)
                elif img_str.startswith('data:image'):
                    logger.info("Processing base64 reference image")
                    # Extract base64 data
                    if "," in img_str:
                        header, encoded = img_str.split(",", 1)
                    else:
                        encoded = img_str
                    data = base64.b64decode(encoded)
                    img = Image.open(io.BytesIO(data))
                    contents.append(img)
            except Exception as e:
                logger.warning(f"Failed to process reference image {img_str[:50]}...: {e}")

    # Extract config from extra_body
    aspect_ratio = "9:16"
    image_size = "2K"

    # Retry logic
    last_exception = None
    for attempt in range(max_retries):
        try:
            logger.info(f"Calling Gemini API (Attempt {attempt + 1}/{max_retries})")
            response = client.models.generate_content(
                model=MODEL_ID,
                contents=contents,
                config=GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE'],
                    temperature=0.2,
                    image_config=ImageConfig(
                        aspect_ratio=aspect_ratio,
                        image_size=image_size,
                    ),
                ),
            )

            # Check for errors
            if not response.candidates or response.candidates[0].finish_reason != FinishReason.STOP:
                reason = "Unknown"
                if response.candidates:
                    reason = response.candidates[0].finish_reason
                raise ValueError(f"Prompt Content Error: {reason}")

            # Extract image
            generated_image = None
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    generated_image = part.inline_data.as_image()
                    break
            
            if generated_image:
                return _save_generated_image(_generated_image_to_png_bytes(generated_image))
            else:
                raise ValueError("No image generated in response")

        except Exception as e:
            last_exception = e
            logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {str(e)}")
            
            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)
                logger.info(f"Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                logger.error(f"All {max_retries} attempts failed")
                raise last_exception

    return None


if __name__ == "__main__":
    # Test the function
    try:
        # You need to provide a valid Google API key for testing
        test_api_key = os.getenv('GOOGLE_API_KEY')
        if not test_api_key:
            print("Please set GOOGLE_API_KEY environment variable for testing")
        else:
            result = generate_social_media_image_core(
                "A cartoon monkey is sitting on a tree.",
                google_api_key=test_api_key
            )
            print(f"Generated image URL: {result}")
    except Exception as e:
        print(f"Generation failed: {e}")
