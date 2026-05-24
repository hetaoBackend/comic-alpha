"""Image generation service"""
import os
import glob
import logging
import requests
import json
from typing import List, Dict, Any, Optional, Union, Tuple
from comic_generator import generate_social_media_image_core

logger = logging.getLogger(__name__)


class ImageService:
    """Image generation and proxy service"""

    # 参考图目录路径（相对于项目根目录）
    REFER_IMAGE_BASE_PATH = "assets/refer_image"
    REFERENCE_CHARACTER_META = "characters.json"
    PROTECTED_REFERENCE_STYLES = {
        "doraemon",
        "disney",
        "ghibli",
        "pixar",
        "tom_and_jerry",
        "nezha",
        "langlangshan",
    }

    @staticmethod
    def get_safe_style_description(comic_style: str) -> str:
        """Return image-model-safe style wording without brand/IP names."""
        style_descriptions = {
            "doraemon": "a rounded, cute, clean-line children's comic style with warm humor and bright simple colors",
            "american": "a bold American comic-book illustration style with dynamic poses, crisp ink lines, and strong contrast",
            "watercolor": "a soft watercolor comic style with gentle color bleeding, light paper texture, and dreamy atmosphere",
            "disney": "a bright family animation-inspired style with rounded shapes, expressive faces, smooth motion, and warm colors",
            "ghibli": "a poetic hand-painted animation-inspired style with gentle natural backgrounds, warm colors, and expressive subtle emotions",
            "pixar": "a polished 3D animated family-film style with rounded character design, soft cinematic lighting, and expressive acting",
            "shonen": "a high-energy Japanese youth manga style with speed lines, dramatic angles, bold expressions, and punchy pacing",
            "tom_and_jerry": "a classic hand-drawn slapstick cartoon style with exaggerated physical comedy, elastic poses, and lively colors",
            "nezha": "a modern Chinese mythic animation-inspired style with bold shapes, energetic action, and rich traditional color accents",
            "langlangshan": "a Chinese ink-wash animation-inspired style with soft brush texture, cute folk-tale characters, and gentle humor",
        }
        return style_descriptions.get(comic_style, comic_style)

    @staticmethod
    def _project_root() -> str:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.dirname(backend_dir)

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
    def resolve_reference_characters(comic_style: str, text: str) -> List[Dict[str, Any]]:
        """
        Map user-facing aliases to safe internal character IDs and reference images.

        The returned aliases are meant for script-stage disambiguation only. Image
        prompts should use safe_id/display_name/reference_name, not the aliases.
        """
        if not text:
            return []

        text_lower = text.lower()
        matched = []
        seen = set()
        for character in ImageService._load_reference_character_meta(comic_style):
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
    def _collect_page_character_ids(page_data: Dict[str, Any]) -> set[str]:
        character_ids = set()
        for row in page_data.get('rows', []) or []:
            for panel in row.get('panels', []) or []:
                for character_id in panel.get('characters', []) or []:
                    character_ids.add(character_id)
        return character_ids

    @staticmethod
    def _select_relevant_reference_images(
        page_data: Dict[str, Any],
        style_references: List[Tuple[str, str]],
        story_bible: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[str, str]]:
        """Only pass reference images for characters used on this page."""
        if not style_references:
            return []

        refs_by_name = {name: (name, path) for name, path in style_references}
        selected_names = set()
        page_character_ids = ImageService._collect_page_character_ids(page_data)
        story_bible = story_bible or {}

        for character in story_bible.get('characters', []) or []:
            if not isinstance(character, dict):
                continue
            if page_character_ids and character.get('id') not in page_character_ids:
                continue
            reference_image = character.get('reference_image') or character.get('name')
            if reference_image:
                selected_names.add(os.path.splitext(os.path.basename(reference_image))[0])
            if character.get('name'):
                selected_names.add(character['name'])

        if not selected_names:
            panel_text = json.dumps(page_data, ensure_ascii=False)
            for name, _ in style_references:
                if name in panel_text:
                    selected_names.add(name)

        selected = []
        for name in selected_names:
            if name in refs_by_name:
                selected.append(refs_by_name[name])
        return selected

    @staticmethod
    def get_style_reference_images(comic_style: str, allow_protected: bool = False) -> List[Tuple[str, str]]:
        """
        Get reference images for a specific comic style.

        Args:
            comic_style: The comic style (e.g., 'doraemon', 'disney', etc.)

        Returns:
            List of tuples (character_name, image_path) where character_name
            is derived from the filename (without extension)
        """
        if comic_style in ImageService.PROTECTED_REFERENCE_STYLES and not allow_protected:
            logger.info("Skipping bundled reference images for protected/IP-adjacent style '%s'", comic_style)
            return []

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
                logger.info(f"Found reference image for '{character_name}': {image_path}")

        return reference_images

    @staticmethod
    def generate_comic_image(
        page_data: Dict[str, Any],
        comic_style: str = 'doraemon',
        reference_img: Optional[Union[str, List[str]]] = None,
        extra_body: Optional[List] = None,
        google_api_key: str = None,
        rows_per_page: Optional[int] = None,
        language: str = 'en',
        story_bible: Optional[Dict[str, Any]] = None,
        continuity_context: Optional[List[Dict[str, Any]]] = None,
        consistency_options: Optional[Dict[str, bool]] = None
    ) -> tuple[Optional[str], str]:
        """
        Generate comic image from page data

        Args:
            page_data: Comic page data with rows and panels
            comic_style: Style of the comic
            reference_img: Optional reference image(s)
            extra_body: Optional extra body parameters (previous pages)
            google_api_key: Google API key for image generation
            rows_per_page: Optional number of rows to strictly limit (3-5)
            language: Language of the comic content
            story_bible: Character, location, prop, and visual consistency rules
            continuity_context: Previous page continuity summaries
            consistency_options: Locks such as character_lock and scene_lock

        Returns:
            Tuple of (image_url, prompt)
        """
        # Truncate page data to rows_per_page if specified
        if rows_per_page is not None and 'rows' in page_data:
            page_data = page_data.copy()  # Don't modify original
            page_data['rows'] = page_data['rows'][:rows_per_page]

        # Get style-specific character reference images and keep only the
        # characters used on this page. Passing an entire IP-adjacent reference
        # folder can trigger model safety filters and also confuses identity.
        style_references = ImageService.get_style_reference_images(comic_style, allow_protected=True)
        style_references = ImageService._select_relevant_reference_images(page_data, style_references, story_bible)
        character_info = []
        style_ref_paths = []

        for char_name, img_path in style_references:
            character_info.append((char_name, img_path))
            style_ref_paths.append(img_path)

        safe_style = ImageService.get_safe_style_description(comic_style)

        # Convert page data to prompt with style, language, and character references
        prompt = ImageService._convert_page_to_prompt(
            page_data,
            safe_style,
            language,
            character_info,
            story_bible=story_bible,
            continuity_context=continuity_context,
            consistency_options=consistency_options
        )

        # Prepare reference images (can be single image or array)
        reference_images = []

        # Add style-specific character reference images first
        reference_images.extend(style_ref_paths)

        # Add the current layout/sketch reference. This was passed by the
        # frontend already; keeping it here makes layout fidelity much stronger.
        if reference_img:
            if isinstance(reference_img, list):
                reference_images.extend(reference_img)
            else:
                reference_images.append(reference_img)

        # Add previous generated pages as additional references
        if extra_body and isinstance(extra_body, list):
            # extra_body contains previous page URLs
            for prev_page in extra_body:
                if isinstance(prev_page, dict) and 'imageUrl' in prev_page:
                    reference_images.append(prev_page['imageUrl'])
                elif isinstance(prev_page, str):
                    reference_images.append(prev_page)

        # Use reference_images if we have any, otherwise None
        final_reference = reference_images if reference_images else None
        
        try:
            image_url = generate_social_media_image_core(
                prompt=prompt,
                reference_img=final_reference,
                google_api_key=google_api_key
            )
        except Exception as e:
            if style_ref_paths and "PROHIBITED_CONTENT" in str(e):
                logger.warning("Retrying without bundled style reference images after prohibited-content response")
                fallback_references = [ref for ref in reference_images if ref not in style_ref_paths]
                image_url = generate_social_media_image_core(
                    prompt=prompt,
                    reference_img=fallback_references if fallback_references else None,
                    google_api_key=google_api_key
                )
            else:
                raise
        
        return image_url, prompt
    
    @staticmethod
    def generate_comic_cover(
        comic_style: str = 'doraemon',
        google_api_key: str = None,
        reference_imgs: List[Union[str, Dict]] = None,
        language: str = 'en',
        custom_requirements: str = ''
    ) -> tuple[Optional[str], str]:
        """
        Generate comic cover image

        Args:
            comic_style: Style of the comic
            google_api_key: Google API key
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
            character_info.append((char_name, img_path))
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
        if reference_imgs:
            for img in reference_imgs:
                if isinstance(img, dict) and 'imageUrl' in img:
                    processed_refs.append(img['imageUrl'])
                elif isinstance(img, str):
                    processed_refs.append(img)

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
        character_info: Optional[List[Tuple[str, str]]] = None,
        story_bible: Optional[Dict[str, Any]] = None,
        continuity_context: Optional[List[Dict[str, Any]]] = None,
        consistency_options: Optional[Dict[str, bool]] = None
    ) -> str:
        """Convert page data to image generation prompt

        Args:
            page_data: Comic page data with rows and panels
            comic_style: Style of the comic
            language: Language code
            character_info: List of (character_name, image_path) tuples for reference
            story_bible: Character, location, prop, and visual consistency rules
            continuity_context: Previous page continuity summaries
            consistency_options: Locks such as character_lock and scene_lock
        """
        import json
        story_bible = story_bible or {}
        continuity_context = continuity_context or []
        consistency_options = consistency_options or {}

        def _dialogue_to_text(dialogue):
            lines = []
            for line in dialogue or []:
                if isinstance(line, dict) and line.get('text'):
                    speaker = line.get('speaker') or ''
                    text = line['text']
                    lines.append(f"speech bubble for {speaker} with exact text: \"{text}\"" if speaker else f"speech bubble with exact text: \"{text}\"")
            return "; ".join(lines)

        def _panel_to_visual_brief(panel):
            # `panel.text` is the user-editable script surface in the frontend.
            # Prefer it so manual edits override stale structured fields.
            edited_text = panel.get('text')
            if isinstance(edited_text, str) and edited_text.strip():
                pieces = []
                if panel.get('shot'):
                    pieces.append(f"shot={panel['shot']}")
                if panel.get('location_id'):
                    pieces.append(f"location_id={panel['location_id']}")
                if panel.get('characters'):
                    pieces.append("characters=" + ", ".join(panel.get('characters') or []))
                if panel.get('emotion'):
                    pieces.append(f"emotion={panel['emotion']}")
                pieces.append(edited_text.strip())
                if panel.get('negative_notes'):
                    pieces.append(f"negative_notes={panel['negative_notes']}")
                return "; ".join(pieces)

            structured_keys = ['shot', 'location_id', 'characters', 'action', 'emotion', 'visual_notes', 'negative_notes']
            if any(panel.get(key) for key in structured_keys) or panel.get('dialogue'):
                pieces = []
                if panel.get('shot'):
                    pieces.append(f"shot={panel['shot']}")
                if panel.get('location_id'):
                    pieces.append(f"location_id={panel['location_id']}")
                if panel.get('characters'):
                    pieces.append("characters=" + ", ".join(panel.get('characters') or []))
                if panel.get('action'):
                    pieces.append(f"action={panel['action']}")
                if panel.get('emotion'):
                    pieces.append(f"emotion={panel['emotion']}")
                if panel.get('visual_notes'):
                    pieces.append(f"visual_notes={panel['visual_notes']}")
                dialogue_text = _dialogue_to_text(panel.get('dialogue'))
                if dialogue_text:
                    pieces.append(f"dialogue={dialogue_text}")
                if panel.get('negative_notes'):
                    pieces.append(f"negative_notes={panel['negative_notes']}")
                return "; ".join(pieces)
            return panel.get('text', '')

        # Build layout description and panel visual briefs. The text from the
        # script is guidance for what to draw, not text to render in the image.
        layout_rows = []
        panels = []
        if 'rows' in page_data:
            for i, row in enumerate(page_data['rows'], 1):
                if 'panels' in row:
                    panel_count = len(row['panels'])
                    layout_rows.append(f"Row {i}: {panel_count} panel(s)")
                    for j, panel in enumerate(row['panels'], 1):
                        panels.append(f"Row {i}, Panel {j} visual brief: {_panel_to_visual_brief(panel)}")

        # Create layout description
        total_rows = len(layout_rows)
        layout_description = f"This page has {total_rows} rows:\n" + "\n".join(layout_rows)

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

## Character Reference Images
The following reference images are provided to show what specific characters look like.
You MUST draw these characters exactly as shown in their reference images:
{char_list}

IMPORTANT: When any of these characters appear in the comic panels, you MUST use their exact appearance from the reference images - same face, hair, clothing, and style.""".format(
                char_list="\n".join(char_descriptions)
            )

        story_bible_section = ""
        if story_bible:
            story_bible_section = """

## Story Bible (Authoritative)
Use this as the source of truth for character identity, scene layout, props, visual rules, and forbidden details:
{story_bible}
""".format(story_bible=json.dumps(story_bible, ensure_ascii=False, indent=2))

        continuity_section = ""
        if continuity_context:
            continuity_section = """

## Continuity Context From Previous Pages
Preserve these states unless the current panel explicitly changes them:
{continuity_context}
""".format(continuity_context=json.dumps(continuity_context, ensure_ascii=False, indent=2))

        lock_requirements = []
        if consistency_options.get('character_lock', True):
            lock_requirements.append("- Character Lock: Character appearance, face, hair, body design, and clothing are fixed by the reference images and story bible. Do not redesign or change outfits.")
        if consistency_options.get('scene_lock', True):
            lock_requirements.append("- Scene Lock: Preserve registered location layout, camera-side landmarks, lighting continuity, and fixed props from the story bible and continuity context.")
        if consistency_options.get('prop_lock', True):
            lock_requirements.append("- Prop Lock: Keep key props visually consistent in shape, color, placement, and ownership.")
        lock_section = "\n".join(lock_requirements)

        # Main prompt content
        prompt_content = """Using the style of {comic_style}, create a comic page made of illustration panels. Use the panel details only as visual briefs for what should be drawn.

# Page Layout (MUST FOLLOW EXACTLY):
{layout_description}

# Content:

## Story Context
{title}

## Panel Visual Briefs
{panels}{character_ref_section}{story_bible_section}{continuity_section}"""

        # Build character reference requirement if available
        char_ref_requirement = ""
        if character_info and len(character_info) > 0:
            char_names = [name for name, _ in character_info]
            char_ref_requirement = f"""
- Character Reference Images: The first {len(character_info)} provided image(s) are character reference images showing what specific characters look like. When drawing characters named {', '.join(char_names)}, you MUST match their appearance exactly as shown in these reference images."""

        # Requirements section (positive guidance only)
        requirements_content = """- **LAYOUT (CRITICAL)**: You MUST strictly follow the page layout specified above. If Row 1 has 1 panel, draw 1 panel in the first row. If Row 2 has 2 panels, draw 2 panels side by side in the second row. Do NOT change the number of rows or panels per row.
- **ILLUSTRATION ONLY (CRITICAL)**: Draw the described scenes directly. Do NOT render the panel descriptions, visual briefs, captions, labels, titles, row names, panel names, or prompt text anywhere in the image.
- Maintain consistency in characters and scenes.
- The image should be colorful and vibrant.
- Dialogue Text: If a panel includes dialogue, render it only as a compact speech bubble near the speaking character. Use the exact dialogue text only. Do NOT render speaker names, subtitles, captions, labels, or repeated dialogue. If the text may become misspelled or garbled, omit the text rather than rendering incorrect text.
- Avoid speech bubbles unless the visual brief explicitly requires dialogue inside the scene.
- When text is explicitly required by the story, keep it minimal and use {target_lang}.
- Maintain consistent and uniform margins around the entire comic page.
- Ensure equal spacing on all sides (top, bottom, left, right) for a professional appearance.
- Character Consistency: Use the provided reference images as the definitive source for character appearances. Carry over the exact facial features, hair styles, and identical clothing/outfits.
- Use the provided blank sketch/layout reference image to preserve the row and panel composition.
{lock_section}{char_ref_requirement}"""

        # Negative prompt (all negative constraints)
        negative_prompt = "rendered panel descriptions, visual brief text, captions above panels, labels above images, prompt text, title text, row labels, panel labels, panel indices visible, panel numbers shown, speaker name labels, character name labels, subtitle-style dialogue, repeated dialogue text, duplicate speech text, speech bubbles unless explicitly required, cluttered dialogue, verbose dialogue, overly complex panels, complex panel content, inconsistent characters, distorted proportions, dull colors, illegible text, misspelled words, duplicated titles, multiple title locations, uneven margins, mismatched fonts, text corruption, mojibake, garbled characters, blurry text, character appearance changes, incorrect clothing, clothing changes without script requirement, layout deviation from sketch, costume changes"
        
        # Format the content
        formatted_prompt = prompt_content.format(
            comic_style=comic_style,
            title=page_data.get('title', ''),
            layout_description=layout_description,
            panels="\n".join(panels),
            target_lang=target_lang,
            character_ref_section=character_ref_section,
            story_bible_section=story_bible_section,
            continuity_section=continuity_section
        )
        
        formatted_requirements = requirements_content.format(
            comic_style=comic_style,
            target_lang=target_lang,
            lock_section=lock_section,
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
