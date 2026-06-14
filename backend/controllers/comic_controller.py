"""Comic controller - handles comic script generation endpoints"""
from flask import Blueprint, request, jsonify
import json
from controllers.auth_utils import infer_text_provider, validate_model_provider, validate_reasoning_effort
from services.comic_service import ComicService, validate_script
from services.image_service import ImageService

comic_bp = Blueprint('comic', __name__)


def _build_reference_context(comic_style: str, prompt: str):
    """Resolve style reference names plus any user alias mappings."""
    reference_character_names = [
        char_name for char_name, _ in ImageService.get_style_reference_images(comic_style)
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
        text_provider = infer_text_provider(data)
        prompt = data.get('prompt')

        provider_error, status_code = validate_model_provider(text_provider, api_key, google_api_key)
        if provider_error:
            return jsonify({"error": provider_error}), status_code
        reasoning_effort, reasoning_error, reasoning_status = validate_reasoning_effort(data.get('reasoning_effort'))
        if reasoning_error:
            return jsonify({"error": reasoning_error}), reasoning_status
        
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

        # Generate comic script
        service = ComicService(api_key, base_url, model, comic_style, language, google_api_key=google_api_key, text_provider=text_provider, reasoning_effort=reasoning_effort)
        comic_pages = service.generate_comic_script(
            prompt,
            page_count,
            rows_per_page,
            reference_character_names=reference_character_names,
            reference_character_directives=reference_character_directives
        )
        
        return jsonify({
            "success": True,
            "pages": comic_pages,
            "page_count": len(comic_pages)
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
