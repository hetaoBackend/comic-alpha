"""Safe local bridge to ComicBrain production storyboard packages."""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


logger = logging.getLogger(__name__)


class ComicBrainError(Exception):
    """Base exception for ComicBrain bridge failures."""


class ComicBrainValidationError(ComicBrainError):
    """The caller supplied an invalid project identifier or payload."""


class ComicBrainNotFoundError(ComicBrainError):
    """The requested production storyboard does not exist."""


class ComicBrainPackageError(ComicBrainError):
    """The production package is malformed or contains unsafe references."""


class ComicBrainConflictError(ComicBrainError):
    """The caller is editing an older ComicBrain source revision."""


class ComicBrainProjectService:
    """Read and update ComicBrain's non-canonical production layer.

    ComicBrain lives inside this repository by default.  The environment
    override exists for tests and alternate local layouts, but browser input
    can never select a filesystem path.
    """

    PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    STORYBOARD_FILENAME = "storyboard.json"
    REVIEW_FILENAME = "review.json"
    RENDER_MANIFEST_DIRNAME = "renders"
    RENDER_MANIFEST_FILENAME = "manifest.json"
    RENDER_MANIFEST_SCHEMA = "comicbrain-renders/1"
    IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    SHA256_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")
    PAGE_FINGERPRINT_PATTERN = re.compile(
        r"^page-v[0-9]+:[0-9]+:[0-9a-fA-F]{8}:[0-9a-fA-F]{8}$"
    )
    PAGE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
    IMAGE_URL_PATTERN = re.compile(
        r"^/(?:backend/)?static/images/"
        r"[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif)$",
        re.IGNORECASE,
    )
    _render_manifest_lock = threading.RLock()

    @classmethod
    def comicbrain_root(cls) -> Path:
        from runtime_paths import workspace_directory
        return workspace_directory()

    @classmethod
    def validate_project_id(cls, value: Any, field_name: str) -> str:
        if not isinstance(value, str) or not cls.PROJECT_ID_PATTERN.fullmatch(value):
            raise ComicBrainValidationError(
                f"{field_name} must start with a letter or number and contain only "
                "letters, numbers, '-' or '_' (maximum 64 characters)"
            )
        return value

    @classmethod
    def _production_root(cls) -> Path:
        comicbrain_root = cls.comicbrain_root().resolve()
        production_root = (comicbrain_root / "production").resolve()
        cls._ensure_within(
            production_root,
            comicbrain_root,
            "ComicBrain production path escapes ComicBrain root",
        )
        return production_root

    @classmethod
    def _project_dir(cls, series_id: Any, chapter_id: Any) -> Path:
        safe_series_id = cls.validate_project_id(series_id, "series_id")
        safe_chapter_id = cls.validate_project_id(chapter_id, "chapter_id")
        production_root = cls._production_root().resolve()
        project_dir = (production_root / safe_series_id / safe_chapter_id).resolve()
        cls._ensure_within(project_dir, production_root, "Project path escapes production root")
        return project_dir

    @staticmethod
    def _ensure_within(path: Path, root: Path, message: str) -> None:
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ComicBrainPackageError(message) from exc

    @classmethod
    def _storyboard_path(cls, series_id: Any, chapter_id: Any) -> Path:
        project_dir = cls._project_dir(series_id, chapter_id)
        storyboard_path = (project_dir / cls.STORYBOARD_FILENAME).resolve()
        cls._ensure_within(
            storyboard_path,
            project_dir,
            "Storyboard path escapes its ComicBrain project directory",
        )
        return storyboard_path

    @classmethod
    def _render_manifest_path(cls, series_id: Any, chapter_id: Any) -> Path:
        project_dir = cls._project_dir(series_id, chapter_id)
        renders_dir = (project_dir / cls.RENDER_MANIFEST_DIRNAME).resolve()
        cls._ensure_within(
            renders_dir,
            project_dir,
            "Render manifest directory escapes its ComicBrain project",
        )
        manifest_path = (renders_dir / cls.RENDER_MANIFEST_FILENAME).resolve()
        cls._ensure_within(
            manifest_path,
            renders_dir,
            "Render manifest path escapes its render directory",
        )
        return manifest_path

    @classmethod
    def _read_json_object(cls, path: Path) -> Dict[str, Any]:
        if not path.is_file():
            raise ComicBrainNotFoundError("ComicBrain storyboard project was not found")
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except json.JSONDecodeError as exc:
            raise ComicBrainPackageError("ComicBrain storyboard JSON is invalid") from exc
        except OSError as exc:
            raise ComicBrainPackageError("ComicBrain storyboard could not be read") from exc

        if not isinstance(payload, dict):
            raise ComicBrainPackageError("ComicBrain storyboard must be a JSON object")
        return payload

    @classmethod
    def get_project(cls, series_id: Any, chapter_id: Any) -> Dict[str, Any]:
        return cls._read_json_object(cls._storyboard_path(series_id, chapter_id))

    @classmethod
    def _empty_render_manifest(
        cls,
        series_id: str,
        chapter_id: str,
        project: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        project_source = project.get("source") if isinstance(project, dict) else {}
        project_source = project_source if isinstance(project_source, dict) else {}
        return {
            "schema_version": cls.RENDER_MANIFEST_SCHEMA,
            "series_id": series_id,
            "chapter_id": chapter_id,
            "source": {
                "source_hash": project_source.get("source_hash"),
                "snapshot_hash": project_source.get("snapshot_hash"),
            },
            "updated_at": None,
            "pages": [],
        }

    @classmethod
    def get_render_manifest(
        cls,
        series_id: Any,
        chapter_id: Any,
        project: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        safe_series_id = cls.validate_project_id(series_id, "series_id")
        safe_chapter_id = cls.validate_project_id(chapter_id, "chapter_id")
        if project is None:
            project = cls.get_project(safe_series_id, safe_chapter_id)
        manifest_path = cls._render_manifest_path(safe_series_id, safe_chapter_id)
        if not manifest_path.exists():
            return cls._empty_render_manifest(
                safe_series_id,
                safe_chapter_id,
                project,
            )
        manifest = cls._read_json_object(manifest_path)
        if manifest.get("schema_version") != cls.RENDER_MANIFEST_SCHEMA:
            raise ComicBrainPackageError("ComicBrain render manifest schema is unsupported")
        if (
            manifest.get("series_id") != safe_series_id
            or manifest.get("chapter_id") != safe_chapter_id
        ):
            raise ComicBrainPackageError(
                "ComicBrain render manifest belongs to another project"
            )
        pages = manifest.get("pages")
        if not isinstance(pages, list):
            raise ComicBrainPackageError("ComicBrain render manifest pages must be a list")
        return manifest

    @classmethod
    def record_page_render(
        cls,
        series_id: Any,
        chapter_id: Any,
        render_payload: Any,
        image_url: Any,
        project: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        safe_series_id = cls.validate_project_id(series_id, "series_id")
        safe_chapter_id = cls.validate_project_id(chapter_id, "chapter_id")
        if not isinstance(render_payload, dict):
            raise ComicBrainValidationError("comicbrain_render must be an object")
        if project is None:
            project = cls.get_project(safe_series_id, safe_chapter_id)

        page_index = render_payload.get("page_index")
        if (
            isinstance(page_index, bool)
            or not isinstance(page_index, int)
            or page_index < 0
        ):
            raise ComicBrainValidationError(
                "comicbrain_render.page_index must be a non-negative integer"
            )
        project_pages = project.get("pages")
        project_pages = project_pages if isinstance(project_pages, list) else []
        if page_index >= len(project_pages):
            raise ComicBrainValidationError(
                "comicbrain_render.page_index is outside the storyboard"
            )

        page_id = render_payload.get("page_id")
        if (
            not isinstance(page_id, str)
            or not cls.PAGE_ID_PATTERN.fullmatch(page_id)
        ):
            raise ComicBrainValidationError(
                "comicbrain_render.page_id is invalid"
            )
        project_page = project_pages[page_index]
        project_page_id = (
            project_page.get("id") if isinstance(project_page, dict) else None
        )
        if isinstance(project_page_id, str) and project_page_id != page_id:
            raise ComicBrainConflictError(
                "ComicBrain page identity has changed; reload before generating"
            )

        fingerprint = render_payload.get("page_script_fingerprint")
        if (
            not isinstance(fingerprint, str)
            or not cls.PAGE_FINGERPRINT_PATTERN.fullmatch(fingerprint)
        ):
            raise ComicBrainValidationError(
                "comicbrain_render.page_script_fingerprint is invalid"
            )
        if (
            not isinstance(image_url, str)
            or not cls.IMAGE_URL_PATTERN.fullmatch(image_url)
        ):
            raise ComicBrainPackageError(
                "Generated ComicBrain image URL is not a local image path"
            )
        page_title = render_payload.get("page_title")
        if not isinstance(page_title, str):
            page_title = ""

        project_source = project.get("source")
        project_source = project_source if isinstance(project_source, dict) else {}
        now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
            "+00:00",
            "Z",
        )
        manifest_path = cls._render_manifest_path(
            safe_series_id,
            safe_chapter_id,
        )

        with cls._render_manifest_lock:
            manifest = cls.get_render_manifest(
                safe_series_id,
                safe_chapter_id,
                project,
            )
            pages = manifest["pages"]
            prior_source = manifest.get("source")
            prior_snapshot_hash = (
                prior_source.get("snapshot_hash")
                if isinstance(prior_source, dict)
                else None
            )
            current_snapshot_hash = project_source.get("snapshot_hash")
            if isinstance(prior_snapshot_hash, str):
                for saved_page in pages:
                    if not isinstance(saved_page, dict):
                        continue
                    for saved_version in saved_page.get("versions", []):
                        if isinstance(saved_version, dict):
                            saved_version.setdefault(
                                "snapshot_hash", prior_snapshot_hash
                            )
            page_record = next(
                (
                    item
                    for item in pages
                    if isinstance(item, dict) and item.get("page_id") == page_id
                ),
                None,
            )
            if page_record is None:
                page_record = {
                    "page_id": page_id,
                    "page_index": page_index,
                    "page_title": page_title,
                    "current_version": 0,
                    "versions": [],
                }
                pages.append(page_record)

            versions = page_record.get("versions")
            versions = versions if isinstance(versions, list) else []
            page_record["versions"] = versions
            existing_version_index = next(
                (
                    index
                    for index, item in enumerate(versions)
                    if isinstance(item, dict)
                    and item.get("image_url") == image_url
                ),
                None,
            )
            if existing_version_index is None:
                versions.append(
                    {
                        "image_url": image_url,
                        "created_at": now,
                        "page_script_fingerprint": fingerprint,
                        "page_script_id": page_id,
                        "snapshot_hash": current_snapshot_hash,
                    }
                )
                existing_version_index = len(versions) - 1
            else:
                versions[existing_version_index]["snapshot_hash"] = current_snapshot_hash

            page_record.update(
                {
                    "page_index": page_index,
                    "page_title": page_title,
                    "page_script_fingerprint": fingerprint,
                    "current_version": existing_version_index,
                }
            )
            pages.sort(
                key=lambda item: (
                    item.get("page_index", 10**9)
                    if isinstance(item, dict)
                    else 10**9
                )
            )
            manifest["source"] = {
                "source_hash": project_source.get("source_hash"),
                "snapshot_hash": project_source.get("snapshot_hash"),
            }
            manifest["updated_at"] = now

            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    encoding="utf-8",
                    dir=manifest_path.parent,
                    prefix=".manifest-",
                    suffix=".tmp",
                    delete=False,
                ) as handle:
                    temp_path = handle.name
                    json.dump(manifest, handle, ensure_ascii=False, indent=2)
                    handle.write("\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_path, manifest_path)
            except OSError as exc:
                raise ComicBrainPackageError(
                    "ComicBrain render manifest could not be written"
                ) from exc
            finally:
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except OSError:
                        logger.warning(
                            "Could not remove temporary render manifest %s",
                            temp_path,
                        )

        return copy.deepcopy(page_record)

    @classmethod
    def get_review(cls, series_id: Any, chapter_id: Any) -> Dict[str, Any] | None:
        project_dir = cls._project_dir(series_id, chapter_id)
        review_path = (project_dir / cls.REVIEW_FILENAME).resolve()
        cls._ensure_within(
            review_path,
            project_dir,
            "Review path escapes its ComicBrain project directory",
        )
        if not review_path.exists():
            return None
        if not review_path.is_file():
            raise ComicBrainPackageError("ComicBrain review path is not a file")
        try:
            with review_path.open("r", encoding="utf-8") as handle:
                review = json.load(handle)
        except json.JSONDecodeError as exc:
            raise ComicBrainPackageError("ComicBrain review JSON is invalid") from exc
        except OSError as exc:
            raise ComicBrainPackageError("ComicBrain review could not be read") from exc
        if not isinstance(review, dict):
            raise ComicBrainPackageError("ComicBrain review must be a JSON object")
        return review

    @staticmethod
    def review_is_stale(
        project: Dict[str, Any],
        review: Dict[str, Any] | None,
    ) -> bool:
        if review is None:
            return False
        project_source = project.get("source")
        review_source = review.get("source")
        project_source = project_source if isinstance(project_source, dict) else {}
        review_source = review_source if isinstance(review_source, dict) else {}

        if "snapshot_hash" in project_source:
            project_snapshot_hash = project_source.get("snapshot_hash")
            review_snapshot_hash = review_source.get("snapshot_hash")
            if (
                not isinstance(project_snapshot_hash, str)
                or not project_snapshot_hash
                or review_snapshot_hash != project_snapshot_hash
            ):
                return True

        project_source_hash = (
            project_source.get("source_hash")
        )
        review_source_hash = (
            review_source.get("source_hash")
        )
        return bool(project_source_hash) and project_source_hash != review_source_hash

    @classmethod
    def require_matching_revision(
        cls,
        project: Dict[str, Any],
        submitted_snapshot_hash: Any = None,
        submitted_source_hash: Any = None,
    ) -> Dict[str, str | None]:
        """Validate the strongest concurrency tokens exposed by a storyboard."""
        project_source = project.get("source")
        if not isinstance(project_source, dict):
            raise ComicBrainPackageError(
                "ComicBrain storyboard is missing source metadata"
            )

        current_snapshot_hash = project_source.get("snapshot_hash")
        current_source_hash = project_source.get("source_hash")
        if "snapshot_hash" in project_source:
            cls._validate_hash_value(
                current_snapshot_hash,
                "storyboard source.snapshot_hash",
                package_value=True,
            )
            cls._validate_hash_value(
                submitted_snapshot_hash,
                "snapshot_hash",
                package_value=False,
            )
            if submitted_snapshot_hash != current_snapshot_hash:
                raise ComicBrainConflictError(
                    "ComicBrain snapshot has changed; reload the project before continuing"
                )

            # source_hash is secondary for snapshot-aware packages. It is
            # optional, but when supplied it must also describe this package.
            if submitted_source_hash is not None:
                cls._validate_hash_value(
                    submitted_source_hash,
                    "source_hash",
                    package_value=False,
                )
                cls._validate_hash_value(
                    current_source_hash,
                    "storyboard source.source_hash",
                    package_value=True,
                )
                if submitted_source_hash != current_source_hash:
                    raise ComicBrainConflictError(
                        "ComicBrain source has changed; reload the project before continuing"
                    )
        else:
            cls._validate_hash_value(
                submitted_source_hash,
                "source_hash",
                package_value=False,
            )
            cls._validate_hash_value(
                current_source_hash,
                "storyboard source.source_hash",
                package_value=True,
            )
            if submitted_source_hash != current_source_hash:
                raise ComicBrainConflictError(
                    "ComicBrain source has changed; reload the project before continuing"
                )

        return {
            "snapshot_hash": (
                current_snapshot_hash
                if isinstance(current_snapshot_hash, str)
                else None
            ),
            "source_hash": (
                current_source_hash
                if isinstance(current_source_hash, str)
                else None
            ),
        }

    @staticmethod
    def _validate_hash_value(
        value: Any,
        field_name: str,
        package_value: bool,
    ) -> str:
        if not isinstance(value, str) or not value.strip():
            if package_value:
                raise ComicBrainPackageError(
                    f"ComicBrain {field_name} must be a non-empty string"
                )
            raise ComicBrainValidationError(
                f"{field_name} is required and must be a non-empty string"
            )
        return value

    @staticmethod
    def _review_hash(
        review_payload: Dict[str, Any],
        field_name: str,
        outer_hash: Any = None,
    ) -> Any:
        review_source = review_payload.get("source")
        nested_hash = (
            review_source.get(field_name)
            if isinstance(review_source, dict)
            else None
        )
        top_level_hash = review_payload.get(field_name)
        submitted_hashes = [
            value
            for value in (outer_hash, top_level_hash, nested_hash)
            if value is not None
        ]
        if not submitted_hashes:
            return None
        if any(not isinstance(value, str) for value in submitted_hashes):
            raise ComicBrainValidationError(
                f"{field_name} must be a non-empty string"
            )
        if len(set(submitted_hashes)) != 1:
            raise ComicBrainValidationError(
                f"Conflicting {field_name} values were provided"
            )
        return submitted_hashes[0]

    @classmethod
    def list_projects(cls) -> List[Dict[str, Any]]:
        production_root = cls._production_root()
        if not production_root.is_dir():
            return []

        projects: List[Dict[str, Any]] = []
        for storyboard_path in production_root.glob("*/*/storyboard.json"):
            try:
                relative_path = storyboard_path.relative_to(production_root)
                series_id, chapter_id, _ = relative_path.parts
                cls.validate_project_id(series_id, "series_id")
                cls.validate_project_id(chapter_id, "chapter_id")
                safe_storyboard_path = cls._storyboard_path(series_id, chapter_id)
                project = cls._read_json_object(safe_storyboard_path)
            except (ComicBrainError, ValueError) as exc:
                logger.warning("Skipping invalid ComicBrain project %s: %s", storyboard_path, exc)
                continue

            source = project.get("source") if isinstance(project.get("source"), dict) else {}
            if str(source.get("status", "")).strip().lower() in {
                "deprecated",
                "archived",
            }:
                continue
            pages = project.get("pages") if isinstance(project.get("pages"), list) else []
            title = project.get("title") or source.get("title") or source.get("chapter_title")
            series_title = project.get("series_title") or source.get("series_title")
            updated_at = (
                project.get("updated_at")
                or source.get("updated_at")
                or source.get("source_updated_at")
                or source.get("updated")
            )
            if not updated_at:
                updated_at = datetime.fromtimestamp(
                    storyboard_path.stat().st_mtime, tz=timezone.utc
                ).isoformat()
            review_path = storyboard_path.with_name(cls.REVIEW_FILENAME)
            review = None
            review_updated_at = None
            if review_path.is_file():
                try:
                    review = cls.get_review(series_id, chapter_id)
                    review_updated_at = review.get("updated_at")
                except ComicBrainPackageError as exc:
                    logger.warning("Could not inspect ComicBrain review %s: %s", review_path, exc)
                if not review_updated_at:
                    review_updated_at = datetime.fromtimestamp(
                        review_path.stat().st_mtime, tz=timezone.utc
                    ).isoformat()

            projects.append(
                {
                    "series_id": series_id,
                    "chapter_id": chapter_id,
                    "title": title,
                    "series_title": series_title,
                    "page_count": len(pages),
                    "updated_at": updated_at,
                    "has_review": review_path.is_file(),
                    "review_updated_at": review_updated_at,
                    "review_stale": cls.review_is_stale(project, review),
                }
            )

        return sorted(
            projects,
            key=lambda item: (item["series_id"], item["chapter_id"]),
        )

    @classmethod
    def save_review(
        cls,
        series_id: Any,
        chapter_id: Any,
        review_payload: Any,
    ) -> Dict[str, Any]:
        safe_series_id = cls.validate_project_id(series_id, "series_id")
        safe_chapter_id = cls.validate_project_id(chapter_id, "chapter_id")
        project_dir = cls._project_dir(safe_series_id, safe_chapter_id)

        # A review is always derived from an existing production storyboard.
        storyboard = cls.get_project(safe_series_id, safe_chapter_id)
        if not isinstance(review_payload, dict):
            raise ComicBrainValidationError("Review payload must be a JSON object")
        outer_source_hash = review_payload.get("source_hash")
        outer_snapshot_hash = review_payload.get("snapshot_hash")
        if (
            "review" in review_payload
            and isinstance(review_payload.get("review"), dict)
            and set(review_payload).issubset(
                {"review", "source_hash", "snapshot_hash"}
            )
        ):
            review_payload = review_payload["review"]
        submitted_source_hash = cls._review_hash(
            review_payload,
            "source_hash",
            outer_source_hash,
        )
        submitted_snapshot_hash = cls._review_hash(
            review_payload,
            "snapshot_hash",
            outer_snapshot_hash,
        )
        expected_revision = cls.require_matching_revision(
            storyboard,
            submitted_snapshot_hash=submitted_snapshot_hash,
            submitted_source_hash=submitted_source_hash,
        )

        review = copy.deepcopy(review_payload)
        storyboard_source = storyboard.get("source")
        source = copy.deepcopy(storyboard_source) if isinstance(storyboard_source, dict) else {}
        source["series_id"] = safe_series_id
        source["chapter_id"] = safe_chapter_id
        review["source"] = source
        review["status"] = "draft"
        review["artifact_status"] = "draft"
        review["updated_at"] = datetime.now(timezone.utc).isoformat()
        if "schema_version" not in review and "schema_version" in storyboard:
            review["schema_version"] = storyboard["schema_version"]

        review_path = project_dir / cls.REVIEW_FILENAME
        temp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=project_dir,
                prefix=".review-",
                suffix=".tmp",
                delete=False,
            ) as handle:
                temp_path = handle.name
                json.dump(review, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())

            # Re-check immediately before replacement so an exporter update
            # that lands while the review is being serialized cannot be hidden
            # by stamping the old pages with the new source metadata.
            latest_storyboard = cls.get_project(safe_series_id, safe_chapter_id)
            cls.require_matching_revision(
                latest_storyboard,
                submitted_snapshot_hash=expected_revision["snapshot_hash"],
                submitted_source_hash=expected_revision["source_hash"],
            )
            os.replace(temp_path, review_path)
        except OSError as exc:
            raise ComicBrainPackageError("ComicBrain review could not be written") from exc
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    logger.warning("Could not remove temporary review file %s", temp_path)

        return review

    @classmethod
    def _iter_reference_values(
        cls,
        character: Dict[str, Any],
    ) -> Iterable[Tuple[Any, str]]:
        """Yield only explicitly canonical references and their asset kind.

        This is deliberately fail-closed. Generic reference fields are
        untrusted unless they carry an affirmative canonical marker.
        """
        explicit_singular_fields = (
            "canonical_reference_path",
            "canonical_reference",
        )
        explicit_plural_fields = (
            "canonical_reference_paths",
            "canonical_references",
        )
        for field in explicit_singular_fields:
            if field in character:
                yield character[field], "canonical-reference"
        for field in explicit_plural_fields:
            values = character.get(field)
            if isinstance(values, list):
                for value in values:
                    yield value, "canonical-reference"

        reference_image = character.get("reference_image")
        if reference_image is not None:
            value_metadata = reference_image if isinstance(reference_image, dict) else {}
            kind = value_metadata.get("kind") or character.get("reference_kind", "")
            status = value_metadata.get("status") or character.get("reference_status")
            canonical = (
                value_metadata.get("canonical") is True
                or character.get("reference_canonical") is True
            )
            if (
                str(kind).startswith("canonical")
                or status in ("canonical", "confirmed")
                or canonical
            ):
                yield reference_image, str(kind or "canonical-reference")

        reference_images = character.get("reference_images")
        if isinstance(reference_images, list):
            for value in reference_images:
                # The exporter contract uses objects here. Bare strings are
                # intentionally ignored because they cannot prove provenance.
                if not isinstance(value, dict):
                    continue
                kind = value.get("kind", "")
                status = value.get("status")
                if (
                    str(kind).startswith("canonical")
                    or status in ("canonical", "confirmed")
                    or value.get("canonical") is True
                ):
                    yield value, str(kind or "canonical-reference")

        references = character.get("references")
        if isinstance(references, list):
            for reference in references:
                if not isinstance(reference, dict):
                    continue
                status = reference.get("status")
                kind = reference.get("kind", "")
                if (
                    str(kind).startswith("canonical")
                    or status in ("canonical", "confirmed")
                    or reference.get("canonical") is True
                ):
                    yield reference, str(kind or "canonical-reference")

    @staticmethod
    def _reference_path(value: Any) -> str | None:
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            for field in ("path", "relative_path", "file"):
                candidate = value.get(field)
                if isinstance(candidate, str):
                    return candidate
        return None

    @classmethod
    def resolve_character_references(
        cls,
        series_id: Any,
        chapter_id: Any,
        selection: Any = None,
        project: Dict[str, Any] | None = None,
    ) -> List[Tuple[str, str]]:
        if project is None:
            project = cls.get_project(series_id, chapter_id)
        elif not isinstance(project, dict):
            raise ComicBrainPackageError("ComicBrain storyboard must be a JSON object")
        characters = project.get("characters", [])
        if characters is None:
            return []
        if not isinstance(characters, list):
            raise ComicBrainPackageError("ComicBrain storyboard characters must be a list")

        comicbrain_root = cls.comicbrain_root().resolve()
        reference_order: List[str] = []
        labels_by_path: Dict[str, List[str]] = {}
        group_reference_paths = set()
        verified_file_hashes: Dict[str, str] = {}
        project_source = project.get("source")
        project_source = project_source if isinstance(project_source, dict) else {}
        snapshot_aware = "snapshot_hash" in project_source
        if snapshot_aware:
            cls._validate_hash_value(
                project_source.get("snapshot_hash"),
                "storyboard source.snapshot_hash",
                package_value=True,
            )
        selection_text = (
            json.dumps(selection, ensure_ascii=False)
            if selection is not None and not isinstance(selection, str)
            else (selection or "")
        )
        selection_text_lower = selection_text.lower()

        for character in characters:
            if not isinstance(character, dict):
                raise ComicBrainPackageError("Each ComicBrain character must be an object")
            label = (
                character.get("name")
                or character.get("display_name")
                or character.get("id")
                or "ComicBrain character"
            )
            if not isinstance(label, str):
                label = str(label)

            declared_aliases = character.get("aliases")
            declared_aliases = declared_aliases if isinstance(declared_aliases, list) else []
            aliases = [
                alias
                for alias in [
                    label,
                    character.get("display_name"),
                    *declared_aliases,
                ]
                if isinstance(alias, str) and alias
            ]
            if selection is not None and not any(
                alias in selection_text or alias.lower() in selection_text_lower
                for alias in aliases
            ):
                continue

            for raw_reference, reference_kind in cls._iter_reference_values(character):
                expected_file_hash = None
                if snapshot_aware:
                    if not isinstance(raw_reference, dict):
                        raise ComicBrainPackageError(
                            f"Snapshot reference for {label} must be an object with sha256"
                        )
                    expected_file_hash = raw_reference.get("sha256")
                    if (
                        not isinstance(expected_file_hash, str)
                        or not cls.SHA256_PATTERN.fullmatch(expected_file_hash)
                    ):
                        raise ComicBrainPackageError(
                            f"Snapshot reference for {label} must include a 64-digit sha256"
                        )
                    expected_file_hash = expected_file_hash.lower()

                relative_reference = cls._reference_path(raw_reference)
                if relative_reference is None:
                    raise ComicBrainPackageError(
                        f"Canonical reference for {label} must contain a path"
                    )
                reference_path = Path(relative_reference)
                if reference_path.is_absolute():
                    raise ComicBrainPackageError(
                        f"Canonical reference for {label} must be relative to ComicBrain"
                    )

                resolved_path = (comicbrain_root / reference_path).resolve()
                cls._ensure_within(
                    resolved_path,
                    comicbrain_root,
                    f"Canonical reference for {label} escapes ComicBrain root",
                )
                if resolved_path.suffix.lower() not in cls.IMAGE_EXTENSIONS:
                    raise ComicBrainPackageError(
                        f"Canonical reference for {label} is not a supported image"
                    )
                if not resolved_path.is_file():
                    raise ComicBrainPackageError(
                        f"Canonical reference image for {label} was not found"
                    )

                normalized_path = str(resolved_path)
                if snapshot_aware:
                    actual_file_hash = verified_file_hashes.get(normalized_path)
                    if actual_file_hash is None:
                        digest = hashlib.sha256()
                        try:
                            with resolved_path.open("rb") as reference_file:
                                for chunk in iter(
                                    lambda: reference_file.read(1024 * 1024),
                                    b"",
                                ):
                                    digest.update(chunk)
                        except OSError as exc:
                            raise ComicBrainPackageError(
                                f"Canonical reference image for {label} could not be read"
                            ) from exc
                        actual_file_hash = digest.hexdigest()
                        verified_file_hashes[normalized_path] = actual_file_hash
                    if actual_file_hash != expected_file_hash:
                        raise ComicBrainPackageError(
                            f"Canonical reference image for {label} no longer matches "
                            "the exported ComicBrain snapshot"
                        )

                if normalized_path not in labels_by_path:
                    labels_by_path[normalized_path] = []
                    reference_order.append(normalized_path)
                if label not in labels_by_path[normalized_path]:
                    labels_by_path[normalized_path].append(label)
                kind_lower = reference_kind.lower()
                if "lineup" in kind_lower or "group" in kind_lower:
                    group_reference_paths.add(normalized_path)

        return [
            (
                (
                    f"{' / '.join(labels_by_path[path])}（群像参考）"
                    if path in group_reference_paths
                    else " / ".join(labels_by_path[path])
                ),
                path,
            )
            for path in reference_order
        ]
