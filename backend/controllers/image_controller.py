"""Image controller - handles image generation and proxy endpoints"""
from flask import Blueprint, request, jsonify, Response
import logging
import os
from controllers.auth_utils import is_loopback_request, validate_reasoning_effort
from services.image_service import ImageService

image_bp = Blueprint('image', __name__)
logger = logging.getLogger(__name__)


@image_bp.route('/api/generate-image', methods=['POST'])
def generate_comic_image():
    """
    Generate final comic image from page data
    
    Expected JSON body:
    {
        "page_data": {...},  # comic page data
        "reference_img": "url" or ["url1", "url2"],  # optional reference image(s)
        "comic_style": "doraemon",  # optional comic style
        "image_provider": "google", "openai", or "codex",
        "google_api_key": "your-google-api-key",
        "api_key": "your-openai-api-key"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        page_data = data.get('page_data')
        if not page_data:
            return jsonify({"error": "Page data is required"}), 400
        
        image_provider = data.get('image_provider', 'google')
        if image_provider not in ['google', 'openai', 'codex']:
            return jsonify({"error": "Image provider must be 'google', 'openai', or 'codex'"}), 400

        google_api_key = data.get('google_api_key')
        openai_api_key = data.get('api_key')
        if image_provider == 'google' and not google_api_key:
            return jsonify({"error": "Google API key is required"}), 400
        if image_provider == 'openai' and not openai_api_key:
            return jsonify({"error": "OpenAI API key is required"}), 400
        if image_provider == 'codex' and not is_loopback_request():
            return jsonify({"error": "Codex credentials can only be used from localhost"}), 403
        reasoning_effort, reasoning_error, reasoning_status = validate_reasoning_effort(data.get('reasoning_effort'))
        if reasoning_error:
            return jsonify({"error": reasoning_error}), reasoning_status
        
        # Optional parameters
        comic_style = data.get('comic_style', 'doraemon')
        reference_img = data.get('reference_img')
        extra_body = data.get('extra_body')
        rows_per_page = data.get('rows_per_page')
        language = data.get('language', 'en')
        openai_base_url = data.get('base_url', 'https://api.openai.com/v1')
        default_image_model = 'gemini-3.1-flash-image-preview' if image_provider == 'google' else 'gpt-image-2'
        image_model = data.get('image_model', default_image_model)
        image_size = data.get('image_size', '1024x1536')
        image_quality = data.get('image_quality', 'medium')

        logger.info(
            "Generating comic image provider=%s model=%s quality=%s size=%s reasoning=%s rows=%s language=%s previous_refs=%s has_layout_ref=%s",
            image_provider,
            image_model,
            image_quality,
            image_size,
            reasoning_effort,
            rows_per_page,
            language,
            len(extra_body) if isinstance(extra_body, list) else 0,
            bool(reference_img),
        )

        # Generate image using service
        image_url, prompt = ImageService.generate_comic_image(
            page_data=page_data,
            comic_style=comic_style,
            reference_img=reference_img,
            extra_body=extra_body,
            google_api_key=google_api_key,
            openai_api_key=openai_api_key,
            openai_base_url=openai_base_url,
            image_provider=image_provider,
            image_model=image_model,
            image_size=image_size,
            image_quality=image_quality,
            reasoning_effort=reasoning_effort,
            rows_per_page=rows_per_page,
            language=language
        )
        
        if not image_url:
            return jsonify({"error": "Image generation failed"}), 500
        
        return jsonify({
            "success": True,
            "image_url": image_url,
            "prompt": prompt
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@image_bp.route('/api/generate-cover', methods=['POST'])
def generate_comic_cover_endpoint():
    """
    Generate comic cover image endpoint
    
    Expected JSON body:
    {
        "comic_style": "doraemon",
        "image_provider": "google", "openai", or "codex",
        "google_api_key": "your-google-api-key",
        "api_key": "your-openai-api-key",
        "reference_imgs": [...]  # optional reference images
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        image_provider = data.get('image_provider', 'google')
        if image_provider not in ['google', 'openai', 'codex']:
            return jsonify({"error": "Image provider must be 'google', 'openai', or 'codex'"}), 400

        google_api_key = data.get('google_api_key')
        openai_api_key = data.get('api_key')
        if image_provider == 'google' and not google_api_key:
            return jsonify({"error": "Google API key is required"}), 400
        if image_provider == 'openai' and not openai_api_key:
            return jsonify({"error": "OpenAI API key is required"}), 400
        if image_provider == 'codex' and not is_loopback_request():
            return jsonify({"error": "Codex credentials can only be used from localhost"}), 403
        reasoning_effort, reasoning_error, reasoning_status = validate_reasoning_effort(data.get('reasoning_effort'))
        if reasoning_error:
            return jsonify({"error": reasoning_error}), reasoning_status

        comic_style = data.get('comic_style', 'doraemon')
        reference_imgs = data.get('reference_imgs')
        language = data.get('language', 'en')
        custom_requirements = data.get('custom_requirements', '')
        openai_base_url = data.get('base_url', 'https://api.openai.com/v1')
        default_image_model = 'gemini-3.1-flash-image-preview' if image_provider == 'google' else 'gpt-image-2'
        image_model = data.get('image_model', default_image_model)
        image_size = data.get('image_size', '1024x1536')
        image_quality = data.get('image_quality', 'medium')

        logger.info(
            "Generating comic cover provider=%s model=%s quality=%s size=%s reasoning=%s language=%s reference_refs=%s custom_requirements=%s",
            image_provider,
            image_model,
            image_quality,
            image_size,
            reasoning_effort,
            language,
            len(reference_imgs) if isinstance(reference_imgs, list) else 0,
            bool(custom_requirements.strip()),
        )

        # Generate cover using service
        image_url, prompt = ImageService.generate_comic_cover(
            comic_style=comic_style,
            google_api_key=google_api_key,
            openai_api_key=openai_api_key,
            openai_base_url=openai_base_url,
            image_provider=image_provider,
            image_model=image_model,
            image_size=image_size,
            image_quality=image_quality,
            reasoning_effort=reasoning_effort,
            reference_imgs=reference_imgs,
            language=language,
            custom_requirements=custom_requirements
        )
        
        if not image_url:
            return jsonify({"error": "Cover generation failed"}), 500
        
        return jsonify({
            "success": True,
            "image_url": image_url,
            "prompt": prompt
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@image_bp.route('/api/proxy-image', methods=['GET'])
def proxy_image():
    """
    Proxy image download to bypass CORS restrictions
    
    Query parameters:
        url: The image URL to download
    """
    try:
        image_url = request.args.get('url')
        if not image_url:
            return jsonify({"error": "Image URL is required"}), 400
        
        # Use service to download image
        image_content, content_type = ImageService.proxy_image_download(image_url)
        
        # Return the image with appropriate headers
        return Response(
            image_content,
            mimetype=content_type,
            headers={
                'Content-Disposition': f'attachment; filename=comic-{os.urandom(4).hex()}.png',
                'Access-Control-Allow-Origin': '*'
            }
        )
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
