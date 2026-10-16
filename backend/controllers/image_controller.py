"""Image controller - handles image generation and proxy endpoints"""
from flask import Blueprint, request, jsonify, Response
import logging
import os
from controllers.auth_utils import (
    is_loopback_request,
    is_trusted_local_request,
    validate_reasoning_effort,
)
from services.comicbrain_project_service import (
    ComicBrainConflictError,
    ComicBrainNotFoundError,
    ComicBrainPackageError,
    ComicBrainProjectService,
    ComicBrainValidationError,
)
from services.image_service import ImageService

image_bp = Blueprint('image', __name__)
logger = logging.getLogger(__name__)


def _comicbrain_image_size(project, fallback):
    """Use the server-owned production size for ComicBrain output."""
    if not isinstance(project, dict):
        return fallback
    settings = project.get("settings")
    settings = settings if isinstance(settings, dict) else {}
    image_size = settings.get("image_size")
    if (
        isinstance(image_size, str)
        and image_size in {"1024x1024", "1024x1536", "1536x1024"}
    ):
        return image_size
    return fallback


def _load_comicbrain_image_context(data, selection=None, use_cover_selection=False):
    """Resolve server-owned ComicBrain data without accepting browser paths."""
    draft_id = data.get("console_draft_id")
    if draft_id is not None:
        if not is_trusted_local_request():
            return None, None, (jsonify(error="ComicBrain 草稿仅允许本机访问"), 403)
        try:
            from services.console_service import ConsoleService
            references, project = ConsoleService.image_context(draft_id, selection)
            return references, project, None
        except (ComicBrainValidationError, ComicBrainNotFoundError, ComicBrainPackageError) as error:
            return None, None, (jsonify(error=str(error)), 400)
    source = data.get("comicbrain_source")
    if source is None:
        return None, None, None
    if not is_trusted_local_request():
        return None, None, (
            jsonify(
                {
                    "error": (
                        "ComicBrain projects require a localhost connection "
                        "and a localhost browser origin"
                    )
                }
            ),
            403,
        )
    if not isinstance(source, dict):
        return None, None, (
            jsonify({"error": "comicbrain_source must be an object"}),
            400,
        )

    try:
        series_id = source.get("series_id")
        chapter_id = source.get("chapter_id")
        project = ComicBrainProjectService.get_project(series_id, chapter_id)
        ComicBrainProjectService.require_matching_revision(
            project,
            submitted_snapshot_hash=source.get("snapshot_hash"),
            submitted_source_hash=source.get("source_hash"),
        )
        if use_cover_selection:
            cover = project.get("cover")
            cover = cover if isinstance(cover, dict) else {}
            selection = {
                "title": cover.get("title") or project.get("title"),
                "brief": (
                    cover.get("brief")
                    or cover.get("visual_brief")
                    or cover.get("prompt")
                    or cover.get("description")
                ),
                "custom_requirements": data.get("custom_requirements"),
            }
        from services.series_character_service import SeriesCharacterService
        references = ComicBrainProjectService.resolve_character_references(
            series_id, chapter_id, selection=selection, project=project)
        configured = SeriesCharacterService.get(series_id)
        if configured['characters'] or configured['revision'] > 1:
            references = SeriesCharacterService.references(series_id, selection)
        return references, project, None
    except ComicBrainConflictError as error:
        return None, None, (jsonify({"error": str(error)}), 409)
    except ComicBrainValidationError as error:
        return None, None, (jsonify({"error": str(error)}), 400)
    except ComicBrainNotFoundError as error:
        return None, None, (jsonify({"error": str(error)}), 404)
    except ComicBrainPackageError as error:
        return None, None, (jsonify({"error": str(error)}), 422)


def _merge_comicbrain_cover_requirements(project, custom_requirements):
    """Add a package's cover brief while preserving caller requirements."""
    if not isinstance(project, dict):
        return custom_requirements

    cover = project.get("cover")
    cover = cover if isinstance(cover, dict) else {}
    source = project.get("source")
    source = source if isinstance(source, dict) else {}
    title = (
        cover.get("title")
        or project.get("title")
        or source.get("chapter_title")
        or source.get("title")
    )
    brief = (
        cover.get("brief")
        or cover.get("visual_brief")
        or cover.get("prompt")
        or cover.get("description")
    )

    existing_requirements = (
        custom_requirements.strip()
        if isinstance(custom_requirements, str)
        else ""
    )
    requirements = []
    if (
        isinstance(title, str)
        and title.strip()
        and title.strip() not in existing_requirements
    ):
        requirements.append(f"ComicBrain cover title: {title.strip()}")
    if (
        isinstance(brief, str)
        and brief.strip()
        and brief.strip() not in existing_requirements
    ):
        requirements.append(f"ComicBrain cover brief: {brief.strip()}")
    if existing_requirements:
        requirements.append(existing_requirements)
    return "\n".join(requirements)


@image_bp.route('/api/generate-image', methods=['POST'])
def generate_comic_image():
    """
    Generate final comic image from page data
    
    Expected JSON body:
    {
        "page_data": {...},  # comic page data
        "reference_img": "url" or ["url1", "url2"],  # optional reference image(s)
        "comic_style": "doraemon",  # optional comic style
        "comicbrain_source": {  # optional, IDs only; no browser paths
            "series_id": "series-one",
            "chapter_id": "ch001",
            "snapshot_hash": "current-storyboard-snapshot-hash",
            "source_hash": "current-storyboard-source-hash"
        },
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

        character_references, comicbrain_project, comicbrain_error = _load_comicbrain_image_context(
            data,
            selection=page_data,
        )
        if comicbrain_error:
            return comicbrain_error
        
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
        image_size = _comicbrain_image_size(comicbrain_project, image_size)
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
            language=language,
            character_references=character_references,
        )
        
        if not image_url:
            return jsonify({"error": "Image generation failed"}), 500

        render_record = None
        comicbrain_render = data.get("comicbrain_render")
        comicbrain_source = data.get("comicbrain_source")
        if (
            comicbrain_project is not None
            and isinstance(comicbrain_source, dict)
            and comicbrain_render is not None
        ):
            try:
                render_record = ComicBrainProjectService.record_page_render(
                    comicbrain_source.get("series_id"),
                    comicbrain_source.get("chapter_id"),
                    comicbrain_render,
                    image_url,
                    comicbrain_project,
                )
            except (
                ComicBrainConflictError,
                ComicBrainValidationError,
                ComicBrainPackageError,
            ) as error:
                logger.warning(
                    "Generated image succeeded but render manifest was not updated: %s",
                    error,
                )

        return jsonify({
            "success": True,
            "image_url": image_url,
            "prompt": prompt,
            "comicbrain_render": render_record,
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
        "reference_imgs": [...],  # optional reference images
        "comicbrain_source": {  # optional, also supplies cover brief and refs
            "series_id": "series-one",
            "chapter_id": "ch001",
            "snapshot_hash": "current-storyboard-snapshot-hash",
            "source_hash": "current-storyboard-source-hash"
        }
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        character_references, comicbrain_project, comicbrain_error = (
            _load_comicbrain_image_context(data, use_cover_selection=True)
        )
        if comicbrain_error:
            return comicbrain_error

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
        custom_requirements = _merge_comicbrain_cover_requirements(
            comicbrain_project,
            custom_requirements,
        )
        openai_base_url = data.get('base_url', 'https://api.openai.com/v1')
        default_image_model = 'gemini-3.1-flash-image-preview' if image_provider == 'google' else 'gpt-image-2'
        image_model = data.get('image_model', default_image_model)
        image_size = data.get('image_size', '1024x1536')
        image_size = _comicbrain_image_size(comicbrain_project, image_size)
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
            custom_requirements=custom_requirements,
            character_references=character_references,
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
