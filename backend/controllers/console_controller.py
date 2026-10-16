"""Local-only creation console API."""
from flask import Blueprint, request, jsonify
from controllers.auth_utils import is_trusted_local_request, validate_model_provider, validate_reasoning_effort
from controllers.comicbrain_controller import _error_response
from services.console_service import ConsoleService
from services.comicbrain_project_service import ComicBrainValidationError

console_bp = Blueprint('console', __name__)

def body_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ComicBrainValidationError('请求需要一个有效的 JSON 对象')
    return data

@console_bp.before_request
def local_only():
    if not is_trusted_local_request():
        return jsonify(error='ComicBrain 控制台仅允许本机及本机浏览器访问'), 403

@console_bp.get('/api/console/workspace')
def workspace():
    try:
        return jsonify(ConsoleService.workspace())
    except Exception as error:
        return _error_response(error)

@console_bp.put('/api/console/drafts/<did>')
def save_draft(did):
    try:
        body = body_object()
        return jsonify(draft=ConsoleService.save_draft(did, body.get('draft'), body.get('revision')))
    except Exception as error:
        return _error_response(error)

@console_bp.post('/api/console/plan')
def plan():
    try:
        data = body_object()
        error, status = validate_model_provider(data.get('text_provider', 'codex'), data.get('api_key'), data.get('google_api_key'))
        if error:
            return jsonify(error=error), status
        effort, error, status = validate_reasoning_effort(data.get('reasoning_effort'))
        if error:
            return jsonify(error=error), status
        data['reasoning_effort'] = effort
        return jsonify(plan=ConsoleService.plan(data))
    except Exception as error:
        return _error_response(error)


@console_bp.post('/api/console/assistant')
def creative_assistant():
    try:
        from services.creative_assistant_service import CreativeAssistantService
        data = body_object()
        error, status = validate_model_provider(data.get('text_provider', 'codex'), data.get('api_key'), data.get('google_api_key'))
        if error:
            return jsonify(error=error), status
        effort, error, status = validate_reasoning_effort(data.get('reasoning_effort'))
        if error:
            return jsonify(error=error), status
        data['reasoning_effort'] = effort
        return jsonify(CreativeAssistantService.reply(data))
    except Exception as error:
        return _error_response(error)


@console_bp.post('/api/console/assistant/apply')
def apply_assistant_change():
    try:
        from services.creative_assistant_service import CreativeAssistantService
        return jsonify(CreativeAssistantService.apply(body_object()))
    except Exception as error:
        return _error_response(error)


@console_bp.post('/api/console/assistant/undo')
def undo_assistant_change():
    try:
        from services.creative_assistant_service import CreativeAssistantService
        return jsonify(CreativeAssistantService.undo(body_object()))
    except Exception as error:
        return _error_response(error)

@console_bp.post('/api/console/canon/prepare')
def prepare_canon():
    try:
        from services.canon_service import CanonService
        data=body_object()
        error,status=validate_model_provider(data.get('text_provider','codex'),data.get('api_key'),data.get('google_api_key'))
        if error:return jsonify(error=error),status
        effort,error,status=validate_reasoning_effort(data.get('reasoning_effort'))
        if error:return jsonify(error=error),status
        data['reasoning_effort']=effort
        return jsonify(CanonService.prepare(data))
    except Exception as error:
        return _error_response(error)

@console_bp.post('/api/console/canon/commit')
def commit_canon():
    try:
        from services.canon_service import CanonService
        return jsonify(CanonService.commit((body_object()).get('token')))
    except Exception as error:
        return _error_response(error)

@console_bp.post('/api/console/storyboard')
def storyboard():
    try:
        data=body_object()
        error,status=validate_model_provider(data.get('text_provider','codex'),data.get('api_key'),data.get('google_api_key'))
        if error:return jsonify(error=error),status
        effort,error,status=validate_reasoning_effort(data.get('reasoning_effort'))
        if error:return jsonify(error=error),status
        data['reasoning_effort']=effort
        return jsonify(pages=ConsoleService.storyboard(data))
    except Exception as error:
        return _error_response(error)


@console_bp.post('/api/console/canon/save')
def save_to_series():
    try:
        from services.canon_service import CanonService
        data = body_object()
        error, status = validate_model_provider(data.get('text_provider', 'codex'), data.get('api_key'), data.get('google_api_key'))
        if error:
            return jsonify(error=error), status
        effort, error, status = validate_reasoning_effort(data.get('reasoning_effort'))
        if error:
            return jsonify(error=error), status
        data['reasoning_effort'] = effort
        return jsonify(CanonService.save(data))
    except Exception as error:
        return _error_response(error)


@console_bp.post('/api/console/retrospective')
def chapter_retrospective():
    try:
        from services.series_memory_service import SeriesMemoryService
        data = body_object()
        error, status = validate_model_provider(data.get('text_provider', 'codex'), data.get('api_key'), data.get('google_api_key'))
        if error:
            return jsonify(error=error), status
        effort, error, status = validate_reasoning_effort(data.get('reasoning_effort'))
        if error:
            return jsonify(error=error), status
        data['reasoning_effort'] = effort
        return jsonify(SeriesMemoryService.retrospective(data))
    except Exception as error:
        return _error_response(error)


@console_bp.put('/api/console/retrospective')
def save_chapter_retrospective():
    try:
        from services.series_memory_service import SeriesMemoryService
        return jsonify(SeriesMemoryService.save_retrospective(body_object()))
    except Exception as error:
        return _error_response(error)


@console_bp.route('/api/console/series/<sid>/characters', methods=['GET', 'PUT'])
def series_characters(sid):
    try:
        from services.series_character_service import SeriesCharacterService
        value = SeriesCharacterService.save(sid, body_object()) if request.method == 'PUT' else SeriesCharacterService.get(sid)
        return jsonify(value)
    except Exception as error:
        return _error_response(error)
