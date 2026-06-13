"""Image controller - handles image generation and proxy endpoints"""
from flask import Blueprint, request, jsonify, Response
import os
from services.image_service import ImageService

image_bp = Blueprint('image', __name__)


@image_bp.route('/api/generate-image', methods=['POST'])
def generate_comic_image():
    """
    Generate final comic image from page data
    
    Expected JSON body:
    {
        "page_data": {...},  # comic page data
        "reference_img": "url" or ["url1", "url2"],  # optional reference image(s)
        "comic_style": "doraemon",  # optional comic style
        "google_api_key": "your-google-api-key"  # required Google API key
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        page_data = data.get('page_data')
        if not page_data:
            return jsonify({"error": "Page data is required"}), 400
        
        google_api_key = data.get('google_api_key')
        if not google_api_key:
            return jsonify({"error": "Google API key is required"}), 400
        
        # Optional parameters
        comic_style = data.get('comic_style', 'doraemon')
        reference_img = data.get('reference_img')
        extra_body = data.get('extra_body')
        rows_per_page = data.get('rows_per_page')
        language = data.get('language', 'en')

        print(f"extra_body: {extra_body}")
        print(f"rows_per_page: {rows_per_page}")
        print(f"language: {language}")

        # Generate image using service
        image_url, prompt = ImageService.generate_comic_image(
            page_data=page_data,
            comic_style=comic_style,
            reference_img=reference_img,
            extra_body=extra_body,
            google_api_key=google_api_key,
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
        "google_api_key": "your-google-api-key",
        "reference_imgs": [...]  # optional reference images
    }
    """
    try:
        data = request.get_json()
        print(f"[Cover Generation] Received data: {data}")
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        google_api_key = data.get('google_api_key')
        if not google_api_key:
            return jsonify({"error": "Google API key is required"}), 400

        comic_style = data.get('comic_style', 'doraemon')
        reference_imgs = data.get('reference_imgs')
        language = data.get('language', 'en')
        custom_requirements = data.get('custom_requirements', '')

        print(f"[Cover Generation] Language: {language}")
        print(f"[Cover Generation] Custom requirements: {custom_requirements}")
        print(f"[Cover Generation] Reference images count: {len(reference_imgs) if reference_imgs else 0}")
        if reference_imgs:
            print(f"[Cover Generation] First reference: {reference_imgs[0] if len(reference_imgs) > 0 else 'None'}")

        # Generate cover using service
        image_url, prompt = ImageService.generate_comic_cover(
            comic_style=comic_style,
            google_api_key=google_api_key,
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
