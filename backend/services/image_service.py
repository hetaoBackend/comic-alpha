"""Image generation service"""
import os
import glob
import logging
import requests
import json
import copy
from typing import List, Dict, Any, Optional, Union, Tuple
from comic_generator import generate_codex_image_core, generate_openai_image_core, generate_social_media_image_core

logger = logging.getLogger(__name__)


class ImageService:
    """Image generation and proxy service"""

    # 参考图目录路径（相对于项目根目录）
    REFER_IMAGE_BASE_PATH = "assets/refer_image"
    REFERENCE_CHARACTER_META = "characters.json"
    SAFE_TEXT_REPLACEMENTS = {
        "disney": {
            "迪士尼动画风格": "明亮家庭动画风格",
            "迪士尼漫画": "明亮家庭动画漫画",
            "迪士尼": "家庭动画",
            "Disney Animation Style": "bright family animation style",
            "Disney animation style": "bright family animation style",
            "Disney comic": "family animation comic",
            "Disney": "family animation",
        }
    }

    @staticmethod
    def get_safe_style_description(comic_style: str) -> str:
        """Return image-model-safe wording for IP-adjacent styles."""
        style_descriptions = {
            "disney": "a bright family animation-inspired style with rounded shapes, expressive faces, smooth motion, and warm colors"
        }
        return style_descriptions.get(comic_style, comic_style)

    @staticmethod
    def _project_root() -> str:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.dirname(backend_dir)

    @staticmethod
    def _env_int(name: str, default: int) -> int:
        try:
            return max(0, int(os.getenv(name, str(default))))
        except ValueError:
            logger.warning("Invalid %s value; using default %s", name, default)
            return default

    @staticmethod
    def _codex_max_previous_page_references() -> int:
        return ImageService._env_int("CODEX_MAX_PREVIOUS_PAGE_REFERENCES", 2)

    @staticmethod
    def _codex_max_cover_page_references() -> int:
        return ImageService._env_int("CODEX_MAX_COVER_PAGE_REFERENCES", 4)

    @staticmethod
    def _reference_dir(comic_style: str) -> str:
        return os.path.join(ImageService._project_root(), ImageService.REFER_IMAGE_BASE_PATH, comic_style)

    @staticmethod
    def _load_reference_character_meta(comic_style: str) -> List[Dict[str, Any]]:
        """Load optional alias metadata for bundled reference characters."""
        meta_path = os.path.join(ImageService._reference_dir(comic_style), ImageService.REFERENCE_CHARACTER_META)
        if not os.path.exists(meta_path):
            return []

        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Failed to load reference character metadata from %s: %s", meta_path, e)
            return []

        characters = payload.get("characters", [])
        return [character for character in characters if isinstance(character, dict)]

    @staticmethod
    def get_reference_character_profiles(comic_style: str) -> List[Dict[str, Any]]:
        """Return one profile per available local reference image.

        characters.json is optional: filenames are always usable as exact aliases,
        and metadata only enriches matching image references with extra aliases.
        """
        style_references = ImageService.get_style_reference_images(comic_style)
        profiles = {}
        for reference_name, image_path in style_references:
            profiles[reference_name] = {
                "aliases": [reference_name],
                "reference_name": reference_name,
                "safe_id": reference_name,
                "display_name": reference_name,
                "role_hint": "",
                "image_path": image_path,
            }

        for character in ImageService._load_reference_character_meta(comic_style):
            reference_name = character.get("reference_name") or character.get("display_name")
            if reference_name not in profiles:
                logger.warning(
                    "Ignoring reference character metadata for %s because no matching image exists in %s",
                    reference_name,
                    comic_style
                )
                continue

            aliases = [
                alias for alias in character.get("aliases", [])
                if isinstance(alias, str) and alias.strip()
            ]
            for value in [
                reference_name,
                character.get("display_name"),
                character.get("safe_id"),
            ]:
                if isinstance(value, str) and value.strip():
                    aliases.append(value)

            deduped_aliases = []
            seen = set()
            for alias in aliases:
                if alias in seen:
                    continue
                seen.add(alias)
                deduped_aliases.append(alias)

            profiles[reference_name].update({
                "aliases": deduped_aliases or [reference_name],
                "safe_id": character.get("safe_id") or reference_name,
                "display_name": character.get("display_name") or reference_name,
                "role_hint": character.get("role_hint", ""),
            })

        return list(profiles.values())

    @staticmethod
    def resolve_reference_characters(comic_style: str, text: str) -> List[Dict[str, Any]]:
        """Map user-facing aliases to safe names and local reference images."""
        if not text:
            return []

        text_lower = text.lower()
        matched = []
        seen = set()
        for character in ImageService.get_reference_character_profiles(comic_style):
            aliases = [alias for alias in character.get("aliases", []) if isinstance(alias, str) and alias]
            if not any(alias in text or alias.lower() in text_lower for alias in aliases):
                continue

            reference_name = character.get("reference_name") or character.get("display_name")
            safe_id = character.get("safe_id") or reference_name
            if not reference_name or safe_id in seen:
                continue

            seen.add(safe_id)
            matched.append({
                "aliases": aliases,
                "reference_name": reference_name,
                "safe_id": safe_id,
                "display_name": character.get("display_name") or reference_name,
                "role_hint": character.get("role_hint", "")
            })
        return matched

    @staticmethod
    def _reference_label(comic_style: str, reference_name: str) -> str:
        for character in ImageService.get_reference_character_profiles(comic_style):
            if character.get("reference_name") == reference_name:
                display_name = character.get("display_name")
                safe_id = character.get("safe_id")
                labels = [reference_name]
                for label in [display_name, safe_id]:
                    if label and label not in labels:
                        labels.append(label)
                return " / ".join(labels)
        return reference_name

    @staticmethod
    def _sanitize_reference_aliases(value: Any, comic_style: str) -> Any:
        """Replace input-only protected aliases before sending prompts to image models."""
        if isinstance(value, str):
            sanitized = value
            for source, replacement in ImageService.SAFE_TEXT_REPLACEMENTS.get(comic_style, {}).items():
                sanitized = sanitized.replace(source, replacement)
            for character in ImageService.get_reference_character_profiles(comic_style):
                replacement = character.get("display_name") or character.get("reference_name")
                if not replacement:
                    continue
                aliases = [alias for alias in character.get("aliases", []) if isinstance(alias, str) and alias]
                for alias in sorted(aliases, key=len, reverse=True):
                    sanitized = sanitized.replace(alias, replacement)
                    sanitized = sanitized.replace(alias.lower(), replacement)
                    sanitized = sanitized.replace(alias.upper(), replacement)
            return sanitized
        if isinstance(value, list):
            return [ImageService._sanitize_reference_aliases(item, comic_style) for item in value]
        if isinstance(value, dict):
            return {
                key: ImageService._sanitize_reference_aliases(item, comic_style)
                for key, item in value.items()
            }
        return value

    @staticmethod
    def _select_relevant_reference_images(
        page_data: Dict[str, Any],
        style_references: List[Tuple[str, str]],
        comic_style: str,
        fallback_to_all: bool = True
    ) -> List[Tuple[str, str]]:
        """Prefer only the local character references named in this page."""
        if not style_references:
            return []

        panel_text = json.dumps(page_data, ensure_ascii=False)
        panel_text_lower = panel_text.lower()
        selected_names = {name for name, _ in style_references if name in panel_text}
        for character in ImageService.get_reference_character_profiles(comic_style):
            reference_name = character.get("reference_name")
            display_name = character.get("display_name")
            aliases = [alias for alias in character.get("aliases", []) if isinstance(alias, str)]
            matched_alias = any(alias in panel_text or alias.lower() in panel_text_lower for alias in aliases)
            matched_display = display_name and display_name in panel_text
            if reference_name and (matched_alias or matched_display):
                selected_names.add(reference_name)

        selected = [(name, path) for name, path in style_references if name in selected_names]
        return selected or (style_references if fallback_to_all else [])

    @staticmethod
    def get_style_reference_images(comic_style: str) -> List[Tuple[str, str]]:
        """
        Get reference images for a specific comic style.

        Args:
            comic_style: The comic style (e.g., 'doraemon', 'disney', etc.)

        Returns:
            List of tuples (character_name, image_path) where character_name
            is derived from the filename (without extension)
        """
        refer_dir = ImageService._reference_dir(comic_style)

        if not os.path.exists(refer_dir):
            logger.debug(f"Reference image directory not found: {refer_dir}")
            return []

        # 支持的图片格式
        image_extensions = ['*.png', '*.jpg', '*.jpeg', '*.webp', '*.gif']
        reference_images = []

        for ext in image_extensions:
            pattern = os.path.join(refer_dir, ext)
            for image_path in glob.glob(pattern):
                # 从文件名提取人物名（去掉扩展名）
                filename = os.path.basename(image_path)
                character_name = os.path.splitext(filename)[0]
                reference_images.append((character_name, image_path))

        return sorted(reference_images, key=lambda item: item[0])

    @staticmethod
    def generate_comic_image(
        page_data: Dict[str, Any],
        comic_style: str = 'doraemon',
        reference_img: Optional[Union[str, List[str]]] = None,
        extra_body: Optional[List] = None,
        google_api_key: str = None,
        openai_api_key: str = None,
        openai_base_url: str = "https://api.openai.com/v1",
        image_provider: str = "google",
        image_model: str = "gemini-3.1-flash-image-preview",
        image_size: str = "1024x1536",
        image_quality: str = "medium",
        reasoning_effort: str = "medium",
        rows_per_page: Optional[int] = None,
        language: str = 'en'
    ) -> tuple[Optional[str], str]:
        """
        Generate comic image from page data

        Args:
            page_data: Comic page data with rows and panels
            comic_style: Style of the comic
            reference_img: Optional reference image(s)
            extra_body: Optional extra body parameters (previous pages)
            google_api_key: Google API key for image generation
            openai_api_key: OpenAI API key for GPT Image generation
            openai_base_url: OpenAI-compatible API base URL
            image_provider: Image provider, "google", "openai", or "codex"
            image_model: Image model name for the selected provider
            image_size: OpenAI image output size
            image_quality: OpenAI image output quality
            reasoning_effort: Codex reasoning effort for image orchestration
            rows_per_page: Optional number of rows to strictly limit (1-5)
            language: Language of the comic content

        Returns:
            Tuple of (image_url, prompt)
        """
        # Truncate page data to rows_per_page if specified
        page_data = copy.deepcopy(page_data)
        if rows_per_page is not None and 'rows' in page_data:
            page_data['rows'] = page_data['rows'][:rows_per_page]

        if comic_style == "disney":
            page_data = ImageService._sanitize_reference_aliases(page_data, comic_style)

        # Get style-specific character reference images
        style_references = ImageService.get_style_reference_images(comic_style)
        style_references = ImageService._select_relevant_reference_images(
            page_data,
            style_references,
            comic_style,
            fallback_to_all=image_provider != "codex"
        )
        if image_provider == "codex" and not style_references:
            logger.info("No page-matched style references found for Codex; skipping bundled style references")
        character_info = []
        style_ref_paths = []

        for char_name, img_path in style_references:
            character_info.append((ImageService._reference_label(comic_style, char_name), img_path))
            style_ref_paths.append(img_path)

        safe_style = ImageService.get_safe_style_description(comic_style)

        # Convert page data to prompt with style, language, and character references
        prompt = ImageService._convert_page_to_prompt(
            page_data, safe_style, language, character_info
        )

        # Prepare reference images (can be single image or array)
        reference_images = []
        layout_references = []
        extra_references = []

        # Add style-specific character reference images first
        reference_images.extend(style_ref_paths)

        # Add the current layout/sketch reference. This is usually passed by
        # the frontend and helps preserve the intended panel composition.
        if reference_img:
            if isinstance(reference_img, list):
                layout_references.extend(reference_img)
            else:
                layout_references.append(reference_img)
        reference_images.extend(layout_references)

        # Add previous generated pages as additional references
        if extra_body and isinstance(extra_body, list):
            # extra_body contains previous page URLs
            for prev_page in extra_body:
                if isinstance(prev_page, dict) and 'imageUrl' in prev_page:
                    extra_references.append(prev_page['imageUrl'])
                elif isinstance(prev_page, str):
                    extra_references.append(prev_page)
        if image_provider == "codex" and extra_references:
            max_previous_refs = ImageService._codex_max_previous_page_references()
            if len(extra_references) > max_previous_refs:
                logger.info(
                    "Codex reference budget: keeping last %s of %s previous-page references",
                    max_previous_refs,
                    len(extra_references)
                )
                extra_references = extra_references[-max_previous_refs:] if max_previous_refs else []
        reference_images.extend(extra_references)

        # Use reference_images if we have any, otherwise None
        final_reference = reference_images if reference_images else None
        
        image_url = ImageService._generate_with_reference_fallbacks(
            prompt=prompt,
            google_api_key=google_api_key,
            openai_api_key=openai_api_key,
            openai_base_url=openai_base_url,
            image_provider=image_provider,
            image_model=image_model,
            image_size=image_size,
            image_quality=image_quality,
            reasoning_effort=reasoning_effort,
            comic_style=comic_style,
            has_character_refs=bool(style_ref_paths),
            reference_sets=[
                final_reference,
                (style_ref_paths + layout_references) if extra_references else None,
                style_ref_paths if style_ref_paths else None,
                layout_references if layout_references and not style_ref_paths else None,
                None if not style_ref_paths else None,
            ]
        )
        
        return image_url, prompt

    @staticmethod
    def _generate_with_reference_fallbacks(
        prompt: str,
        google_api_key: str,
        openai_api_key: str,
        openai_base_url: str,
        image_provider: str,
        image_model: str,
        image_size: str,
        image_quality: str,
        reasoning_effort: str,
        comic_style: str,
        has_character_refs: bool,
        reference_sets: List[Optional[List[Any]]]
    ) -> Optional[str]:
        tried = set()
        last_error = None

        for refs in reference_sets:
            refs = refs or None
            if has_character_refs and refs is None:
                continue
            key = tuple(json.dumps(ref, sort_keys=True, default=str) for ref in (refs or []))
            if key in tried:
                continue
            tried.add(key)

            try:
                if image_provider == "codex":
                    return generate_codex_image_core(
                        prompt=prompt,
                        reference_img=refs,
                        model=image_model,
                        size=image_size,
                        quality=image_quality,
                        reasoning_effort=reasoning_effort
                    )
                if image_provider == "openai":
                    return generate_openai_image_core(
                        prompt=prompt,
                        reference_img=refs,
                        api_key=openai_api_key,
                        base_url=openai_base_url,
                        model=image_model,
                        size=image_size,
                        quality=image_quality
                    )
                return generate_social_media_image_core(
                    prompt=prompt,
                    reference_img=refs,
                    google_api_key=google_api_key
                )
            except Exception as e:
                last_error = e
                if comic_style == "disney" and "PROHIBITED_CONTENT" in str(e):
                    if has_character_refs and not refs:
                        break
                    logger.warning("Retrying Disney image generation with fewer references after prohibited-content response")
                    continue
                raise

        if last_error:
            raise last_error
        return None
    
    @staticmethod
    def generate_comic_cover(
        comic_style: str = 'doraemon',
        google_api_key: str = None,
        openai_api_key: str = None,
        openai_base_url: str = "https://api.openai.com/v1",
        image_provider: str = "google",
        image_model: str = "gemini-3.1-flash-image-preview",
        image_size: str = "1024x1536",
        image_quality: str = "medium",
        reasoning_effort: str = "medium",
        reference_imgs: List[Union[str, Dict]] = None,
        language: str = 'en',
        custom_requirements: str = ''
    ) -> tuple[Optional[str], str]:
        """
        Generate comic cover image

        Args:
            comic_style: Style of the comic
            google_api_key: Google API key
            openai_api_key: OpenAI API key
            openai_base_url: OpenAI-compatible API base URL
            image_provider: Image provider, "google", "openai", or "codex"
            image_model: Image model name for the selected provider
            image_size: OpenAI image output size
            image_quality: OpenAI image output quality
            reasoning_effort: Codex reasoning effort for cover orchestration
            reference_imgs: List of reference image URLs
            language: Language of the comic
            custom_requirements: User's custom cover requirements (optional)

        Returns:
            Tuple of (image_url, prompt)
        """
        # Get style-specific character reference images
        style_references = ImageService.get_style_reference_images(comic_style)
        character_info = []
        style_ref_paths = []

        for char_name, img_path in style_references:
            character_info.append((ImageService._reference_label(comic_style, char_name), img_path))
            style_ref_paths.append(img_path)

        safe_style = ImageService.get_safe_style_description(comic_style)

        # Create cover prompt with character references
        prompt = ImageService._create_cover_prompt(
            safe_style, language, custom_requirements, character_info
        )

        # Prepare reference images list
        processed_refs = []

        # Add style-specific character reference images first
        processed_refs.extend(style_ref_paths)

        # Add story page reference images (extract URLs from objects if needed)
        story_page_refs = []
        if reference_imgs:
            for img in reference_imgs:
                if isinstance(img, dict) and 'imageUrl' in img:
                    story_page_refs.append(img['imageUrl'])
                elif isinstance(img, str):
                    story_page_refs.append(img)
        if image_provider == "codex" and story_page_refs:
            max_cover_refs = ImageService._codex_max_cover_page_references()
            if len(story_page_refs) > max_cover_refs:
                logger.info(
                    "Codex cover reference budget: keeping last %s of %s story-page references",
                    max_cover_refs,
                    len(story_page_refs)
                )
                story_page_refs = story_page_refs[-max_cover_refs:] if max_cover_refs else []
        processed_refs.extend(story_page_refs)

        if image_provider == "codex":
            image_url = generate_codex_image_core(
                prompt=prompt,
                reference_img=processed_refs,
                model=image_model,
                size=image_size,
                quality=image_quality,
                reasoning_effort=reasoning_effort
            )
        elif image_provider == "openai":
            image_url = generate_openai_image_core(
                prompt=prompt,
                reference_img=processed_refs,
                api_key=openai_api_key,
                base_url=openai_base_url,
                model=image_model,
                size=image_size,
                quality=image_quality
            )
        else:
            image_url = generate_social_media_image_core(
                prompt=prompt,
                reference_img=processed_refs,
                google_api_key=google_api_key
            )

        return image_url, prompt
    
    @staticmethod
    def proxy_image_download(image_url: str) -> tuple[bytes, str]:
        """
        Proxy image download to bypass CORS restrictions
        
        Args:
            image_url: URL of the image to download
            
        Returns:
            Tuple of (image_content, content_type)
        """
        response = requests.get(image_url, timeout=60)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch image: {response.status_code}")
        
        content_type = response.headers.get('Content-Type', 'image/png')
        return response.content, content_type
    
    @staticmethod
    def _convert_page_to_prompt(
        page_data: Dict[str, Any],
        comic_style: str = 'doraemon',
        language: str = 'en',
        character_info: Optional[List[Tuple[str, str]]] = None
    ) -> str:
        """Convert page data to image generation prompt

        Args:
            page_data: Comic page data with rows and panels
            comic_style: Style of the comic
            language: Language code
            character_info: List of (character_name, image_path) tuples for reference
        """
        import json

        # Build layout description and panel visual briefs. The text from the
        # script is guidance for what to draw, not text to render in the image.
        layout_rows = []
        panels = []
        panel_counts = []
        if 'rows' in page_data:
            for i, row in enumerate(page_data['rows'], 1):
                if 'panels' in row:
                    panel_count = len(row['panels'])
                    panel_counts.append(panel_count)
                    layout_rows.append(f"Row {i}: {panel_count} panel(s)")
                    for j, panel in enumerate(row['panels'], 1):
                        if 'text' in panel:
                            panels.append(f"Row {i}, Panel {j} visual brief: {panel['text']}")

        # Create layout description
        total_rows = len(layout_rows)
        layout_description = f"This page has {total_rows} rows:\n" + "\n".join(layout_rows)
        single_panel_page = total_rows == 1 and panel_counts == [1]

        language_map = {
            'zh': 'Chinese (简体中文)',
            'en': 'English',
            'ja': 'Japanese (日本語)',
            'ko': 'Korean (한국어)',
            'fr': 'French (Français)',
            'de': 'German (Deutsch)',
            'es': 'Spanish (Español)'
        }
        target_lang = language_map.get(language, 'English')

        # Build character reference section if available
        character_ref_section = ""
        if character_info and len(character_info) > 0:
            char_descriptions = []
            for idx, (char_name, _) in enumerate(character_info, 1):
                char_descriptions.append(
                    f"  - Reference image #{idx}: locked character asset `{char_name}`. "
                    "Preserve the exact character identity from this image: species, face shape, eye color, ear shape/length, body proportions, outfit/uniform, clothing colors, belt, badges, accessories, and overall silhouette."
                )
            character_ref_section = """

## Character Reference Images
The following reference images are locked character assets, not loose inspiration.
You MUST draw these characters exactly as shown in their reference images:
{char_list}

IMPORTANT:
- When any locked character appears in the comic panels, use the corresponding reference image as the definitive source.
- Do not redesign, age-shift, simplify into a different cute character, change clothing, change uniform, change eye color, or change body proportions.
- If the scene action conflicts with the outfit, keep the reference outfit and change only the pose/expression/action.""".format(
                char_list="\n".join(char_descriptions)
            )

        # Main prompt content
        prompt_content = """Using the style of {comic_style}, create a comic page made of illustration panels. Use the panel details only as visual briefs for what should be drawn.

# Page Layout (MUST FOLLOW EXACTLY):
{layout_description}

# Content:

## Story Context
{title}

## Panel Visual Briefs
{panels}{character_ref_section}"""

        # Build character reference requirement if available
        char_ref_requirement = ""
        if character_info and len(character_info) > 0:
            char_names = [name for name, _ in character_info]
            char_ref_requirement = f"""
- Character Reference Images: The first {len(character_info)} provided image(s) are locked character reference images for {', '.join(char_names)}. Match the exact face, eye color, ear shape, body proportions, outfit/uniform, clothing colors, belt, badges, and accessories from those images. Do not replace a uniform with casual clothes or redesign the character as a younger/cuter variant."""

        # Requirements section (positive guidance only)
        single_panel_requirement = ""
        if single_panel_page:
            single_panel_requirement = "\n- **SINGLE PANEL PAGE (CRITICAL)**: This page must be one full-page illustration panel only. Do NOT split it into multiple rows, multiple panels, comic strips, or repeated views."

        requirements_content = """- **LAYOUT (CRITICAL)**: You MUST strictly follow the page layout specified above. If Row 1 has 1 panel, draw 1 panel in the first row. If Row 2 has 2 panels, draw 2 panels side by side in the second row. Do NOT change the number of rows or panels per row.
- **ILLUSTRATION ONLY (CRITICAL)**: Draw the described scenes directly. Do NOT render the panel descriptions, visual briefs, captions, labels, titles, row names, panel names, or prompt text anywhere in the image.
- Maintain consistency in characters and scenes.
- The image should be colorful and vibrant.
- Avoid speech bubbles unless the visual brief explicitly requires dialogue inside the scene.
- When text is explicitly required by the story, keep it minimal and use {target_lang}.
- Maintain consistent and uniform margins around the entire comic page.
- Ensure equal spacing on all sides (top, bottom, left, right) for a professional appearance.
- Character Consistency: Use the provided reference images as the definitive source for character appearances. Carry over the exact facial features, hair styles, and identical clothing/outfits.{single_panel_requirement}{char_ref_requirement}"""

        # Negative prompt (all negative constraints)
        negative_prompt = "rendered panel descriptions, visual brief text, captions above panels, labels above images, prompt text, title text, row labels, panel labels, panel indices visible, panel numbers shown, extra rows, extra panels, split comic strip when one panel is requested, repeated views, speech bubbles unless explicitly required, cluttered dialogue, verbose dialogue, overly complex panels, complex panel content, inconsistent characters, distorted proportions, dull colors, illegible text, misspelled words, duplicated titles, multiple title locations, uneven margins, mismatched fonts, text corruption, mojibake, garbled characters, blurry text, character appearance changes, incorrect clothing, casual clothing replacing a uniform, missing belt, missing badge, wrong eye color, childlike redesign, younger variant, clothing changes without script requirement, layout deviation from sketch, costume changes"
        
        # Format the content
        formatted_prompt = prompt_content.format(
            comic_style=comic_style,
            title=page_data.get('title', ''),
            layout_description=layout_description,
            panels="\n".join(panels),
            target_lang=target_lang,
            character_ref_section=character_ref_section
        )
        
        formatted_requirements = requirements_content.format(
            comic_style=comic_style,
            target_lang=target_lang,
            single_panel_requirement=single_panel_requirement,
            char_ref_requirement=char_ref_requirement
        )
        
        # Create structured JSON
        img_prompt = {
            "image_generation_data": {
                "prompt": formatted_prompt.strip(),
                "requirements": formatted_requirements.strip(),
                "negative_prompt": negative_prompt
            }
        }
        
        return json.dumps(img_prompt, ensure_ascii=False)

    @staticmethod
    def _create_cover_prompt(
        comic_style: str,
        language: str = 'en',
        custom_requirements: str = '',
        character_info: Optional[List[Tuple[str, str]]] = None
    ) -> str:
        """Create prompt for comic cover

        Args:
            comic_style: Style of the comic
            language: Language code
            custom_requirements: User's custom cover requirements
            character_info: List of (character_name, image_path) tuples for reference
        """
        language_map = {
            'zh': 'Chinese (简体中文)',
            'en': 'English',
            'ja': 'Japanese (日本語)',
            'ko': 'Korean (한국어)',
            'fr': 'French (Français)',
            'de': 'German (Deutsch)',
            'es': 'Spanish (Español)'
        }

        target_lang = language_map.get(language, 'English')

        # Build character reference section if available
        character_ref_section = ""
        if character_info and len(character_info) > 0:
            char_descriptions = []
            for idx, (char_name, _) in enumerate(character_info, 1):
                char_descriptions.append(f"  - Reference image #{idx}: Character named '{char_name}'")
            character_ref_section = """
# Character Reference Images:
The following reference images are provided to show what specific characters look like.
You MUST draw these characters exactly as shown in their reference images:
{char_list}

IMPORTANT: When any of these characters appear in the cover, you MUST use their exact appearance from the reference images - same face, hair, clothing, and style.
""".format(char_list="\n".join(char_descriptions))

        prompt_template = """Create a high-quality comic book cover in the style of {comic_style}.
{character_ref_section}
# Important Context:
- The reference images provided show the story pages of this comic (after any character reference images).
- You MUST base the cover on the characters, scenes, and storyline shown in these reference images.
- The cover should capture the essence and key moments from the story pages.
- Use the same characters, props, and items with consistent appearances as shown in the reference images.

# Requirements:
- The image must be a vertical comic book cover composition.
- The art style must strictly follow {comic_style}.
- Make it eye-catching and dramatic while staying true to the story.
- Feature the main characters and key scenes from the reference story pages.
- High resolution, detailed, and professional quality.
- No other text except the title.
- The title text must be in {target_lang}.
- Clear and sharp text for the title, do not repeat all the titles in reference images.
- Vibrant colors and "Cover Art" aesthetic.
- Only present one row one panel in the cover.
- Ensure all characters in the title are correctly rendered and legible.
- The cover should feel like a natural introduction to the story shown in the reference pages.
{custom_section}"""

        # Add custom requirements if provided
        custom_section = ""
        if custom_requirements and custom_requirements.strip():
            custom_section = f"""

# IMPORTANT - User's Custom Requirements (MUST FOLLOW STRICTLY):
The user has provided specific requirements below. These are CRITICAL and take HIGHEST PRIORITY.
You MUST strictly follow these custom requirements while maintaining the basic comic cover style.

User Requirements:
{custom_requirements.strip()}

** You MUST implement ALL of the above user requirements. They are mandatory. **"""

        final_prompt = prompt_template.format(
            comic_style=comic_style,
            target_lang=target_lang,
            custom_section=custom_section,
            character_ref_section=character_ref_section
        )
        return final_prompt.strip()
