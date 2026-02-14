import os
import requests
import logging
import time
import uuid
import io
import base64

from dotenv import load_dotenv
from typing import Optional
from google import genai
from google.genai.types import GenerateContentConfig, ImageConfig, FinishReason
from PIL import Image

logger = logging.getLogger(__name__)
load_dotenv()


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
    MODEL_ID = "gemini-3-pro-image-preview"
    
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
                # Save image to static/images
                filename = f"{uuid.uuid4()}.png"
                # Use absolute path to ensure correctness
                base_dir = os.path.dirname(os.path.abspath(__file__))
                static_dir = os.path.join(base_dir, "static", "images")
                os.makedirs(static_dir, exist_ok=True)
                
                save_path = os.path.join(static_dir, filename)
                generated_image.save(save_path)
                logger.info(f"Image saved to {save_path}")
                
                # Return URL path relative to static folder
                return f"/backend/static/images/{filename}"
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