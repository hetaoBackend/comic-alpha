"""Session controller - handles session title generation endpoints"""
from flask import Blueprint, request, jsonify
import json
from controllers.auth_utils import infer_text_provider, validate_model_provider, validate_reasoning_effort
from services.session_title_service import SessionTitleService

session_bp = Blueprint('session', __name__)


@session_bp.route('/api/generate-session-title', methods=['POST'])
def generate_session_title():
    """
    Generate a concise, descriptive title for a comic session

    Expected JSON body:
    {
        "api_key": "your-openai-api-key",  # optional
        "google_api_key": "your-google-api-key",  # optional, preferred
        "prompt": "user's comic prompt",  # required
        "comic_data": {...},  # optional, the generated comic data
        "base_url": "https://api.openai.com/v1",  # optional
        "model": "gpt-4o-mini",  # optional
        "language": "zh"  # optional
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

        if not prompt.strip():
            return jsonify({"error": "Prompt cannot be empty"}), 400

        # Optional parameters
        base_url = data.get('base_url', 'https://api.openai.com/v1')
        model = data.get('model', 'gpt-4o-mini')
        language = data.get('language', 'zh')
        comic_data = data.get('comic_data')

        # Generate title
        service = SessionTitleService(
            api_key=api_key,
            base_url=base_url,
            model=model,
            language=language,
            google_api_key=google_api_key,
            text_provider=text_provider,
            reasoning_effort=reasoning_effort
        )

        title = service.generate_title(prompt, comic_data)

        return jsonify({
            "success": True,
            "title": title,
            "original_prompt": prompt
        })

    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
