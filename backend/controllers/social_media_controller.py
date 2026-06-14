"""Social media controller - handles social media content generation endpoints"""
from flask import Blueprint, request, jsonify
import json
from controllers.auth_utils import infer_text_provider, validate_model_provider, validate_reasoning_effort
from services.social_media_service import SocialMediaService

social_bp = Blueprint('social', __name__)


@social_bp.route('/api/generate-xiaohongshu', methods=['POST'])
def generate_xiaohongshu_content():
    """
    Generate social media post content (Xiaohongshu or Twitter)
    
    Expected JSON body:
    {
        "api_key": "your-openai-api-key",
        "comic_data": [...],  # array of comic pages
        "base_url": "https://api.openai.com/v1",  # optional
        "model": "gpt-4o-mini",  # optional
        "platform": "xiaohongshu"  # or "twitter"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        api_key = data.get('api_key')
        google_api_key = data.get('google_api_key')
        text_provider = infer_text_provider(data)
        comic_data = data.get('comic_data')

        provider_error, status_code = validate_model_provider(text_provider, api_key, google_api_key)
        if provider_error:
            return jsonify({"error": provider_error}), status_code
        reasoning_effort, reasoning_error, reasoning_status = validate_reasoning_effort(data.get('reasoning_effort'))
        if reasoning_error:
            return jsonify({"error": reasoning_error}), reasoning_status
        
        if not comic_data:
            return jsonify({"error": "Comic data is required"}), 400
        
        # Optional parameters
        base_url = data.get('base_url', 'https://api.openai.com/v1')
        model = data.get('model', 'gpt-4o-mini')
        platform = data.get('platform', 'xiaohongshu')
        
        # Generate social content using service
        service = SocialMediaService(api_key, base_url, model, google_api_key=google_api_key, text_provider=text_provider, reasoning_effort=reasoning_effort)
        result = service.generate_social_content(comic_data, platform)
        
        return jsonify({
            "success": True,
            **result
        })
        
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON parsing failed: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
