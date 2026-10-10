"""Local-only API for ComicBrain production storyboard projects."""

import logging

from flask import Blueprint, jsonify, request

from controllers.auth_utils import is_trusted_local_request
from services.comicbrain_project_service import (
    ComicBrainConflictError,
    ComicBrainNotFoundError,
    ComicBrainPackageError,
    ComicBrainProjectService,
    ComicBrainValidationError,
)


comicbrain_bp = Blueprint("comicbrain", __name__)
logger = logging.getLogger(__name__)


def _error_response(error: Exception):
    if isinstance(error, ComicBrainConflictError):
        return jsonify({"error": str(error)}), 409
    if isinstance(error, ComicBrainValidationError):
        return jsonify({"error": str(error)}), 400
    if isinstance(error, ComicBrainNotFoundError):
        return jsonify({"error": str(error)}), 404
    if isinstance(error, ComicBrainPackageError):
        return jsonify({"error": str(error)}), 422
    logger.exception("Unexpected ComicBrain bridge failure")
    return jsonify({"error": "ComicBrain bridge failed"}), 500


def _reject_nonlocal():
    if not is_trusted_local_request():
        return jsonify(
            {
                "error": (
                    "ComicBrain projects require a localhost connection "
                    "and a localhost browser origin"
                )
            }
        ), 403
    return None


@comicbrain_bp.route("/api/comicbrain/projects", methods=["GET"])
def list_comicbrain_projects():
    local_error = _reject_nonlocal()
    if local_error:
        return local_error
    try:
        return jsonify(
            {
                "success": True,
                "projects": ComicBrainProjectService.list_projects(),
            }
        )
    except Exception as error:
        return _error_response(error)


@comicbrain_bp.route(
    "/api/comicbrain/projects/<series_id>/<chapter_id>",
    methods=["GET"],
)
def get_comicbrain_project(series_id: str, chapter_id: str):
    local_error = _reject_nonlocal()
    if local_error:
        return local_error
    try:
        project = ComicBrainProjectService.get_project(series_id, chapter_id)
        review = ComicBrainProjectService.get_review(series_id, chapter_id)
        renders = ComicBrainProjectService.get_render_manifest(
            series_id,
            chapter_id,
            project,
        )
        return jsonify(
            {
                "success": True,
                "project": project,
                "review": review,
                "review_stale": ComicBrainProjectService.review_is_stale(project, review),
                "renders": renders,
            }
        )
    except Exception as error:
        return _error_response(error)


@comicbrain_bp.route(
    "/api/comicbrain/projects/<series_id>/<chapter_id>/review",
    methods=["PUT"],
)
def save_comicbrain_review(series_id: str, chapter_id: str):
    local_error = _reject_nonlocal()
    if local_error:
        return local_error

    review_payload = request.get_json(silent=True)
    if review_payload is None:
        return jsonify({"error": "Review payload must be a JSON object"}), 400

    try:
        review = ComicBrainProjectService.save_review(
            series_id,
            chapter_id,
            review_payload,
        )
        return jsonify({"success": True, "review": review})
    except Exception as error:
        return _error_response(error)
