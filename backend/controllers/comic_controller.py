"""Comic controller - handles comic script generation endpoints"""
from flask import Blueprint, request, jsonify
import json
from services.comic_service import ComicService, validate_script
from services.image_service import ImageService

comic_bp = Blueprint('comic', __name__)


def _build_reference_context(comic_style: str, prompt: str):
    """Resolve style reference names plus any user alias mappings."""
    reference_character_names = [
        char_name for char_name, _ in ImageService.get_style_reference_images(comic_style, allow_protected=True)
    ]
    reference_character_directives = ImageService.resolve_reference_characters(comic_style, prompt)
    for item in reference_character_directives:
        reference_name = item.get("reference_name")
        if reference_name and reference_name not in reference_character_names:
            reference_character_names.append(reference_name)
    return reference_character_names, reference_character_directives


@comic_bp.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "Comic generator API is running"})


@comic_bp.route('/api/generate', methods=['POST'])
def generate_comic():
    """
    Generate comic script endpoint
    
    Expected JSON body:
    {
        "api_key": "your-openai-api-key",
        "prompt": "description of the comic",
        "page_count": 3,
        "base_url": "https://api.openai.com/v1",  # optional
        "model": "gpt-4o-mini"  # optional
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        api_key = data.get('api_key')
        google_api_key = data.get('google_api_key')
        prompt = data.get('prompt')
        
        if not api_key and not google_api_key:
            return jsonify({"error": "Either OpenAI API key or Google API key is required"}), 400
        
        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400
        
        # Optional parameters
        page_count = data.get('page_count', 3)
        base_url = data.get('base_url', 'https://api.openai.com/v1')
        model = data.get('model', 'gpt-4o-mini')
        comic_style = data.get('comic_style', 'doraemon')
        language = data.get('language', 'zh')
        rows_per_page = data.get('rows_per_page', 4)

        # Validate page count
        if not isinstance(page_count, int) or page_count < 1 or page_count > 10:
            return jsonify({"error": "Page count must be between 1 and 10"}), 400

        # Validate rows per page
        if not isinstance(rows_per_page, int) or rows_per_page < 1 or rows_per_page > 5:
            return jsonify({"error": "Rows per page must be between 1 and 5"}), 400

        reference_character_names, reference_character_directives = _build_reference_context(comic_style, prompt)

        # Generate comic package
        service = ComicService(api_key, base_url, model, comic_style, language, google_api_key=google_api_key)
        comic_package = service.generate_comic_package(
            prompt,
            page_count,
            rows_per_page,
            reference_character_names=reference_character_names,
            reference_character_directives=reference_character_directives,
            existing_story_bible=data.get('story_bible')
        )
        comic_pages = comic_package.get("pages", [])
        
        return jsonify({
            "success": True,
            "pages": comic_pages,
            "page_count": len(comic_pages),
            "story_bible": comic_package.get("story_bible", {}),
            "continuity_summaries": comic_package.get("continuity_summaries", []),
            "review_notes": comic_package.get("review_notes", [])
        })
        
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@comic_bp.route('/api/story-ideas', methods=['POST'])
def generate_story_ideas():
    """Generate 3 selectable creative directions before storyboard generation."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        api_key = data.get('api_key')
        google_api_key = data.get('google_api_key')
        prompt = data.get('prompt')

        if not api_key and not google_api_key:
            return jsonify({"error": "Either OpenAI API key or Google API key is required"}), 400
        if not prompt or not prompt.strip():
            return jsonify({"error": "Prompt is required"}), 400

        base_url = data.get('base_url', 'https://api.openai.com/v1')
        model = data.get('model', 'gpt-4o-mini')
        comic_style = data.get('comic_style', 'doraemon')
        language = data.get('language', 'zh')

        reference_character_names, reference_character_directives = _build_reference_context(comic_style, prompt)

        service = ComicService(api_key, base_url, model, comic_style, language, google_api_key=google_api_key)
        ideas = service.generate_story_ideas(
            prompt,
            reference_character_names,
            reference_character_directives=reference_character_directives
        )

        return jsonify({
            "success": True,
            "ideas": ideas,
            "original_prompt": prompt
        })

    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@comic_bp.route('/api/review-script', methods=['POST'])
def review_script():
    """Review script for continuity and production issues."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        pages = data.get('pages') or data.get('script')
        if not pages:
            return jsonify({"error": "Pages or script are required"}), 400
        if isinstance(pages, dict) and 'pages' in pages:
            pages = pages['pages']
        if isinstance(pages, dict):
            pages = [pages]

        service = ComicService(language=data.get('language', 'zh'))
        result = service.review_script(pages, data.get('story_bible'))

        return jsonify({
            "success": True,
            "review_notes": result.get("review_notes", []),
            "cleaned_pages": result.get("cleaned_pages", pages)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@comic_bp.route('/api/rewrite-panel', methods=['POST'])
def rewrite_panel():
    """Rewrite one panel while preserving story bible constraints."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        api_key = data.get('api_key')
        google_api_key = data.get('google_api_key')
        panel = data.get('panel')

        if not api_key and not google_api_key:
            return jsonify({"error": "Either OpenAI API key or Google API key is required"}), 400
        if not panel:
            return jsonify({"error": "Panel is required"}), 400

        service = ComicService(
            api_key=api_key,
            base_url=data.get('base_url', 'https://api.openai.com/v1'),
            model=data.get('model', 'gpt-4o-mini'),
            comic_style=data.get('comic_style', 'doraemon'),
            language=data.get('language', 'zh'),
            google_api_key=google_api_key
        )

        result = service.rewrite_panel(
            panel=panel,
            story_bible=data.get('story_bible') or {},
            before_panel=data.get('before_panel'),
            after_panel=data.get('after_panel'),
            instruction=data.get('instruction') or 'make it clearer'
        )

        return jsonify({
            "success": True,
            **result
        })

    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@comic_bp.route('/api/validate', methods=['POST'])
def validate_script_endpoint():
    """
    Validate comic script format
    
    Expected JSON body:
    {
        "script": {...}  # comic script object or array
    }
    """
    try:
        data = request.get_json()
        script = data.get('script')
        
        is_valid, error = validate_script(script)
        
        if is_valid:
            return jsonify({"valid": True})
        else:
            return jsonify({"valid": False, "error": error})
        
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)})
