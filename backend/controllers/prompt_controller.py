"""Prompt optimization controller - handles prompt optimization endpoints"""
from flask import Blueprint, request, jsonify
import json
from controllers.auth_utils import infer_text_provider, validate_model_provider, validate_reasoning_effort
from services.prompt_optimizer_service import PromptOptimizerService

prompt_bp = Blueprint('prompt', __name__)


@prompt_bp.route('/api/optimize-prompt', methods=['POST'])
def optimize_prompt():
    """
    Optimize user's simple prompt into detailed comic description
    
    Expected JSON body:
    {
        "api_key": "your-openai-api-key",  # optional
        "google_api_key": "your-google-api-key",  # optional, preferred
        "prompt": "simple user prompt",  # required
        "base_url": "https://api.openai.com/v1",  # optional
        "model": "gpt-4o-mini",  # optional
        "comic_style": "doraemon",  # optional
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
        comic_style = data.get('comic_style', 'doraemon')
        language = data.get('language', 'zh')

        # Optimize prompt
        service = PromptOptimizerService(
            api_key=api_key,
            base_url=base_url,
            model=model,
            comic_style=comic_style,
            language=language,
            google_api_key=google_api_key,
            text_provider=text_provider,
            reasoning_effort=reasoning_effort
        )
        
        optimized_prompt = service.optimize_prompt(prompt)
        
        return jsonify({
            "success": True,
            "optimized_prompt": optimized_prompt,
            "original_prompt": prompt
        })
        
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
