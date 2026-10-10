import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from app import app  # noqa: E402
from services import image_service as image_service_module  # noqa: E402
from services.comicbrain_project_service import (  # noqa: E402
    ComicBrainPackageError,
    ComicBrainProjectService,
    ComicBrainValidationError,
)
from services.image_service import ImageService  # noqa: E402


class ComicBrainBridgeTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.comicbrain_root = Path(self.temp_dir.name) / "ComicBrain"
        self.project_dir = (
            self.comicbrain_root / "production" / "series-one" / "ch001"
        )
        self.project_dir.mkdir(parents=True)
        self.reference_path = self.comicbrain_root / "wiki" / "assets" / "hero.png"
        self.reference_path.parent.mkdir(parents=True)
        reference_bytes = b"not-a-real-png-but-a-local-reference"
        self.reference_path.write_bytes(reference_bytes)
        self.reference_sha256 = hashlib.sha256(reference_bytes).hexdigest()

        self.storyboard = {
            "schema_version": "comicbrain-alpha/1",
            "title": "第一章",
            "series_title": "测试系列",
            "source": {
                "series_id": "series-one",
                "chapter_id": "ch001",
                "source_hash": "source-v1",
                "snapshot_hash": "snapshot-v1",
                "source_updated_at": "2026-07-24T00:00:00+00:00",
            },
            "cover": {
                "title": "测试封面",
                "brief": "主角站在山顶，朝霞从背后升起。",
            },
            "characters": [
                {
                    "id": "c001",
                    "name": "主角",
                    "reference_images": [
                        {
                            "path": "wiki/assets/hero.png",
                            "kind": "canonical-image-source",
                            "sha256": self.reference_sha256,
                        }
                    ],
                }
            ],
            "pages": [
                {
                    "title": "Page 1",
                    "rows": [{"panels": [{"text": "主角出发。"}]}],
                }
            ],
        }
        self._write_storyboard()

        self.previous_root = os.environ.get("COMICBRAIN_ROOT")
        os.environ["COMICBRAIN_ROOT"] = str(self.comicbrain_root)
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def tearDown(self):
        if self.previous_root is None:
            os.environ.pop("COMICBRAIN_ROOT", None)
        else:
            os.environ["COMICBRAIN_ROOT"] = self.previous_root
        self.temp_dir.cleanup()

    def test_default_root_is_embedded_in_repository(self):
        override = os.environ.pop("COMICBRAIN_ROOT", None)
        try:
            repository_root = Path(BACKEND_DIR).parent
            self.assertEqual(
                (repository_root / "ComicBrain").resolve(),
                ComicBrainProjectService.comicbrain_root(),
            )
        finally:
            if override is not None:
                os.environ["COMICBRAIN_ROOT"] = override

    def _write_storyboard(self):
        with (self.project_dir / "storyboard.json").open(
            "w",
            encoding="utf-8",
        ) as handle:
            json.dump(self.storyboard, handle, ensure_ascii=False)

    def test_list_and_get_project_include_review_state(self):
        response = self.client.get("/api/comicbrain/projects")
        self.assertEqual(200, response.status_code)
        projects = response.get_json()["projects"]
        self.assertEqual(1, len(projects))
        self.assertEqual(
            {
                "series_id": "series-one",
                "chapter_id": "ch001",
                "title": "第一章",
                "series_title": "测试系列",
                "page_count": 1,
                "updated_at": "2026-07-24T00:00:00+00:00",
                "has_review": False,
                "review_updated_at": None,
                "review_stale": False,
            },
            projects[0],
        )

        response = self.client.get(
            "/api/comicbrain/projects/series-one/ch001"
        )
        self.assertEqual(200, response.status_code)
        payload = response.get_json()
        self.assertEqual(self.storyboard, payload["project"])
        self.assertIsNone(payload["review"])
        self.assertFalse(payload["review_stale"])
        self.assertEqual(
            {
                "schema_version": "comicbrain-renders/1",
                "series_id": "series-one",
                "chapter_id": "ch001",
                "source": {
                    "source_hash": "source-v1",
                    "snapshot_hash": "snapshot-v1",
                },
                "updated_at": None,
                "pages": [],
            },
            payload["renders"],
        )

    def test_deprecated_production_snapshot_is_hidden_from_project_picker(self):
        self.storyboard["source"]["status"] = "deprecated"
        self._write_storyboard()

        response = self.client.get("/api/comicbrain/projects")
        self.assertEqual(200, response.status_code)
        self.assertEqual([], response.get_json()["projects"])

        direct = self.client.get(
            "/api/comicbrain/projects/series-one/ch001"
        )
        self.assertEqual(200, direct.status_code)

    def test_review_is_atomic_draft_and_uses_current_storyboard_source(self):
        response = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={
                "status": "canonical",
                "source": {
                    "series_id": "attacker-series",
                    "chapter_id": "attacker-chapter",
                    "source_hash": "source-v1",
                    "snapshot_hash": "snapshot-v1",
                },
                "pages": [{"title": "人工调整", "rows": []}],
            },
        )
        self.assertEqual(200, response.status_code)
        review = response.get_json()["review"]
        self.assertEqual("draft", review["status"])
        self.assertEqual("draft", review["artifact_status"])
        self.assertEqual("series-one", review["source"]["series_id"])
        self.assertEqual("ch001", review["source"]["chapter_id"])
        self.assertEqual("source-v1", review["source"]["source_hash"])
        self.assertEqual("人工调整", review["pages"][0]["title"])

        review_path = self.project_dir / "review.json"
        self.assertTrue(review_path.is_file())
        self.assertEqual(review, json.loads(review_path.read_text(encoding="utf-8")))
        self.assertEqual([], list(self.project_dir.glob(".review-*.tmp")))

        listed = self.client.get("/api/comicbrain/projects").get_json()["projects"][0]
        self.assertTrue(listed["has_review"])
        self.assertIsNotNone(listed["review_updated_at"])
        self.assertFalse(listed["review_stale"])

        self.storyboard["source"]["source_hash"] = "source-v2"
        self._write_storyboard()
        loaded = self.client.get(
            "/api/comicbrain/projects/series-one/ch001"
        ).get_json()
        self.assertEqual("source-v2", loaded["project"]["source"]["source_hash"])
        self.assertEqual("source-v1", loaded["review"]["source"]["source_hash"])
        self.assertTrue(loaded["review_stale"])

    def test_review_cas_rejects_missing_and_stale_source_hash(self):
        review_path = self.project_dir / "review.json"

        missing_hash = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={"pages": [{"title": "Missing hash", "rows": []}]},
        )
        self.assertEqual(400, missing_hash.status_code)
        self.assertFalse(review_path.exists())

        matching_hash = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={
                "source_hash": "source-v1",
                "snapshot_hash": "snapshot-v1",
                "pages": [{"title": "Accepted v1", "rows": []}],
            },
        )
        self.assertEqual(200, matching_hash.status_code)
        accepted_review = review_path.read_bytes()
        self.assertEqual(
            "source-v1",
            matching_hash.get_json()["review"]["source"]["source_hash"],
        )

        self.storyboard["source"]["source_hash"] = "source-v2"
        self._write_storyboard()
        stale_hash = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={
                "source": {"source_hash": "source-v1"},
                "snapshot_hash": "snapshot-v1",
                "pages": [{"title": "Must not replace v1", "rows": []}],
            },
        )
        self.assertEqual(409, stale_hash.status_code)
        self.assertEqual(accepted_review, review_path.read_bytes())
        self.assertEqual([], list(self.project_dir.glob(".review-*.tmp")))

    def test_snapshot_hash_wins_when_source_hash_is_unchanged(self):
        review_path = self.project_dir / "review.json"
        accepted = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={
                "source": {
                    "source_hash": "source-v1",
                    "snapshot_hash": "snapshot-v1",
                },
                "pages": [{"title": "Accepted snapshot v1", "rows": []}],
            },
        )
        self.assertEqual(200, accepted.status_code)
        accepted_bytes = review_path.read_bytes()

        # The script text is unchanged, but a derived field or canonical
        # reference changed and therefore produced a new snapshot.
        self.storyboard["source"]["snapshot_hash"] = "snapshot-v2"
        self._write_storyboard()
        loaded = self.client.get(
            "/api/comicbrain/projects/series-one/ch001"
        ).get_json()
        self.assertTrue(loaded["review_stale"])

        stale_review = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={
                "source": {
                    "source_hash": "source-v1",
                    "snapshot_hash": "snapshot-v1",
                },
                "pages": [{"title": "Must not be written", "rows": []}],
            },
        )
        self.assertEqual(409, stale_review.status_code)
        self.assertEqual(accepted_bytes, review_path.read_bytes())

        stale_source = {
            "series_id": "series-one",
            "chapter_id": "ch001",
            "source_hash": "source-v1",
            "snapshot_hash": "snapshot-v1",
        }
        with (
            patch(
                "controllers.image_controller.ImageService.generate_comic_image"
            ) as generate_image,
            patch(
                "controllers.image_controller.ImageService.generate_comic_cover"
            ) as generate_cover,
        ):
            image_response = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": stale_source,
                },
            )
            cover_response = self.client.post(
                "/api/generate-cover",
                json={
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": stale_source,
                },
            )

        self.assertEqual(409, image_response.status_code)
        self.assertEqual(409, cover_response.status_code)
        generate_image.assert_not_called()
        generate_cover.assert_not_called()

    def test_invalid_ids_and_path_traversal_are_rejected(self):
        response = self.client.get(
            "/api/comicbrain/projects/series.bad/ch001"
        )
        self.assertEqual(400, response.status_code)

        with self.assertRaises(ComicBrainValidationError):
            ComicBrainProjectService.get_project("../outside", "ch001")

        self.storyboard["characters"][0]["reference_images"][0]["path"] = (
            "../../../../outside.png"
        )
        self._write_storyboard()
        with self.assertRaises(ComicBrainPackageError):
            ComicBrainProjectService.resolve_character_references(
                "series-one",
                "ch001",
            )

        outside_storyboard = Path(self.temp_dir.name) / "outside-storyboard.json"
        outside_storyboard.write_text("{}", encoding="utf-8")
        (self.project_dir / "storyboard.json").unlink()
        (self.project_dir / "storyboard.json").symlink_to(outside_storyboard)
        with self.assertRaises(ComicBrainPackageError):
            ComicBrainProjectService.get_project("series-one", "ch001")

    def test_nonlocal_requests_are_rejected(self):
        response = self.client.get(
            "/api/comicbrain/projects",
            environ_base={"REMOTE_ADDR": "192.0.2.20"},
        )
        self.assertEqual(403, response.status_code)

    def test_hostile_browser_origins_are_rejected(self):
        response = self.client.get(
            "/api/comicbrain/projects",
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(403, response.status_code)

        response = self.client.get(
            "/api/comicbrain/projects",
            headers={"Origin": "null"},
        )
        self.assertEqual(403, response.status_code)

        response = self.client.get(
            "/api/comicbrain/projects",
            headers={"Origin": "http://localhost:8000"},
        )
        self.assertEqual(200, response.status_code)

        response = self.client.put(
            "/api/comicbrain/projects/series-one/ch001/review",
            json={"pages": []},
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(403, response.status_code)

        response = self.client.get(
            "/api/comicbrain/projects",
            headers={"Origin": "http://localhost:not-a-port"},
        )
        self.assertEqual(403, response.status_code)

        response = self.client.get(
            "/api/comicbrain/projects/series-one/ch001",
            environ_base={"REMOTE_ADDR": "192.0.2.20"},
        )
        self.assertEqual(403, response.status_code)

    def test_generate_image_resolves_references_from_project_ids(self):
        self.storyboard["settings"] = {"image_size": "1024x1536"}
        self._write_storyboard()
        with patch(
            "controllers.image_controller.ImageService.generate_comic_image",
            return_value=("/static/images/generated.png", "prompt"),
        ) as generate_image:
            response = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "image_size": "1536x1024",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v1",
                        "source_hash": "source-v1",
                    },
                    "comicbrain_render": {
                        "page_index": 0,
                        "page_id": "page-1",
                        "page_title": "Page 1",
                        "page_script_fingerprint": (
                            "page-v1:10:12345678:90abcdef"
                        ),
                    },
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(
            [("主角", str(self.reference_path.resolve()))],
            generate_image.call_args.kwargs["character_references"],
        )
        self.assertEqual(
            "1024x1536",
            generate_image.call_args.kwargs["image_size"],
        )
        render_record = response.get_json()["comicbrain_render"]
        self.assertEqual("page-1", render_record["page_id"])
        self.assertEqual(0, render_record["current_version"])
        self.assertEqual(
            "/static/images/generated.png",
            render_record["versions"][0]["image_url"],
        )
        loaded = self.client.get(
            "/api/comicbrain/projects/series-one/ch001"
        ).get_json()
        self.assertEqual(1, len(loaded["renders"]["pages"]))

    def test_render_manifest_appends_versions_atomically(self):
        payload = {
            "page_index": 0,
            "page_id": "page-1",
            "page_title": "Page 1",
            "page_script_fingerprint": "page-v1:10:12345678:90abcdef",
        }
        first = ComicBrainProjectService.record_page_render(
            "series-one",
            "ch001",
            payload,
            "/backend/static/images/page-1-v1.png",
            self.storyboard,
        )
        second = ComicBrainProjectService.record_page_render(
            "series-one",
            "ch001",
            payload,
            "/backend/static/images/page-1-v2.png",
            self.storyboard,
        )

        self.assertEqual(1, len(first["versions"]))
        self.assertEqual(2, len(second["versions"]))
        self.assertEqual(1, second["current_version"])
        manifest = ComicBrainProjectService.get_render_manifest(
            "series-one",
            "ch001",
            self.storyboard,
        )
        self.assertEqual(2, len(manifest["pages"][0]["versions"]))
        self.assertEqual([], list((self.project_dir / "renders").glob("*.tmp")))

    def test_generate_cover_merges_package_brief_and_character_references(self):
        cover_brief = self.storyboard["cover"]["brief"]
        with patch(
            "controllers.image_controller.ImageService.generate_comic_cover",
            return_value=("/static/images/cover.png", "prompt"),
        ) as generate_cover:
            response = self.client.post(
                "/api/generate-cover",
                json={
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "custom_requirements": (
                        f"标题使用“测试封面”。\n{cover_brief}\n使用竖版构图。"
                    ),
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v1",
                        "source_hash": "source-v1",
                    },
                },
            )

        self.assertEqual(200, response.status_code)
        kwargs = generate_cover.call_args.kwargs
        self.assertEqual(
            [("主角", str(self.reference_path.resolve()))],
            kwargs["character_references"],
        )
        self.assertIn("测试封面", kwargs["custom_requirements"])
        self.assertIn("主角站在山顶", kwargs["custom_requirements"])
        self.assertIn("使用竖版构图", kwargs["custom_requirements"])
        self.assertEqual(1, kwargs["custom_requirements"].count(cover_brief))

    def test_generate_endpoints_require_current_source_hash_before_provider_call(self):
        with patch(
            "controllers.image_controller.ImageService.generate_comic_image"
        ) as generate_image:
            missing_hash = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                    },
                },
            )
            stale_hash = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v0",
                        "source_hash": "source-v0",
                    },
                },
            )

        self.assertEqual(400, missing_hash.status_code)
        self.assertEqual(409, stale_hash.status_code)
        generate_image.assert_not_called()

        with patch(
            "controllers.image_controller.ImageService.generate_comic_cover"
        ) as generate_cover:
            missing_cover_hash = self.client.post(
                "/api/generate-cover",
                json={
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                    },
                },
            )
            stale_cover_hash = self.client.post(
                "/api/generate-cover",
                json={
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v0",
                        "source_hash": "source-v0",
                    },
                },
            )

        self.assertEqual(400, missing_cover_hash.status_code)
        self.assertEqual(409, stale_cover_hash.status_code)
        generate_cover.assert_not_called()

    def test_snapshot_reference_sha256_is_verified_before_provider_call(self):
        with patch(
            "controllers.image_controller.ImageService.generate_comic_image"
        ) as generate_image:
            self.storyboard["characters"][0]["reference_images"][0]["sha256"] = "bad"
            self._write_storyboard()
            malformed_hash = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v1",
                        "source_hash": "source-v1",
                    },
                },
            )

            self.storyboard["characters"][0]["reference_images"][0][
                "sha256"
            ] = self.reference_sha256
            self._write_storyboard()
            self.reference_path.write_bytes(b"changed-after-export")
            mismatched_file = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v1",
                        "source_hash": "source-v1",
                    },
                },
            )

        self.assertEqual(422, malformed_hash.status_code)
        self.assertEqual(422, mismatched_file.status_code)
        generate_image.assert_not_called()

    def test_legacy_package_falls_back_to_source_hash(self):
        self.storyboard["source"].pop("snapshot_hash")
        # Legacy packages may carry an explicitly canonical reference without
        # a per-file digest.
        self.storyboard["characters"][0] = {
            "id": "c001",
            "name": "主角",
            "reference_image": "wiki/assets/hero.png",
            "reference_kind": "canonical-image-source",
        }
        self._write_storyboard()

        with patch(
            "controllers.image_controller.ImageService.generate_comic_image",
            return_value=("/static/images/generated.png", "prompt"),
        ) as generate_image:
            response = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "source_hash": "source-v1",
                    },
                },
            )

        self.assertEqual(200, response.status_code)
        generate_image.assert_called_once()

    def test_generate_endpoints_reject_nonlocal_comicbrain_source(self):
        with patch(
            "controllers.image_controller.ImageService.generate_comic_image"
        ) as generate_image:
            response = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v1",
                        "source_hash": "source-v1",
                    },
                },
                environ_base={"REMOTE_ADDR": "192.0.2.20"},
            )
        self.assertEqual(403, response.status_code)
        generate_image.assert_not_called()

        with patch(
            "controllers.image_controller.ImageService.generate_comic_image"
        ) as generate_image:
            response = self.client.post(
                "/api/generate-image",
                json={
                    "page_data": self.storyboard["pages"][0],
                    "image_provider": "google",
                    "google_api_key": "fake",
                    "comicbrain_source": {
                        "series_id": "series-one",
                        "chapter_id": "ch001",
                        "snapshot_hash": "snapshot-v1",
                        "source_hash": "source-v1",
                    },
                },
                headers={"Origin": "https://attacker.example"},
            )
        self.assertEqual(403, response.status_code)
        generate_image.assert_not_called()

    def test_reference_selection_and_group_labels(self):
        friend_path = self.comicbrain_root / "wiki" / "assets" / "friend.png"
        lineup_path = self.comicbrain_root / "wiki" / "assets" / "lineup.png"
        friend_bytes = b"friend"
        lineup_bytes = b"lineup"
        friend_path.write_bytes(friend_bytes)
        lineup_path.write_bytes(lineup_bytes)
        friend_sha256 = hashlib.sha256(friend_bytes).hexdigest()
        lineup_sha256 = hashlib.sha256(lineup_bytes).hexdigest()
        self.storyboard["characters"] = [
            {
                "id": "c001",
                "name": "主角",
                "aliases": ["小主"],
                "reference_images": [
                    {
                        "path": "wiki/assets/hero.png",
                        "kind": "canonical-image-source",
                        "sha256": self.reference_sha256,
                    },
                    {
                        "path": "wiki/assets/lineup.png",
                        "kind": "canonical-lineup-source",
                        "sha256": lineup_sha256,
                    },
                ],
            },
            {
                "id": "c002",
                "name": "伙伴",
                "aliases": ["小伙伴"],
                "reference_images": [
                    {
                        "path": "wiki/assets/friend.png",
                        "kind": "canonical-image-source",
                        "sha256": friend_sha256,
                    },
                    {
                        "path": "wiki/assets/lineup.png",
                        "kind": "canonical-lineup-source",
                        "sha256": lineup_sha256,
                    },
                ],
            },
        ]
        self._write_storyboard()

        selected_one = ComicBrainProjectService.resolve_character_references(
            "series-one",
            "ch001",
            selection={"text": "小主独自走进教室。"},
        )
        self.assertEqual(
            [
                ("主角", str(self.reference_path.resolve())),
                ("主角（群像参考）", str(lineup_path.resolve())),
            ],
            selected_one,
        )

        selected_both = ComicBrainProjectService.resolve_character_references(
            "series-one",
            "ch001",
            selection={"text": "主角与伙伴并肩出发。"},
        )
        self.assertIn(
            ("主角 / 伙伴（群像参考）", str(lineup_path.resolve())),
            selected_both,
        )
        self.assertIn(("伙伴", str(friend_path.resolve())), selected_both)

    def test_unmarked_and_draft_references_fail_closed(self):
        self.storyboard["characters"] = [
            {
                "name": "缺少标记",
                "reference_images": [{"path": "wiki/assets/hero.png"}],
            },
            {
                "name": "草稿资源",
                "reference_images": [
                    {
                        "path": "wiki/assets/hero.png",
                        "status": "draft",
                    }
                ],
            },
            {
                "name": "裸字符串列表",
                "reference_images": ["wiki/assets/hero.png"],
                "reference_kind": "canonical-image-source",
            },
            {
                "name": "普通单图",
                "reference_image": "wiki/assets/hero.png",
            },
            {
                "name": "候选单图",
                "reference_image": {
                    "path": "wiki/assets/hero.png",
                    "status": "candidate",
                },
            },
        ]
        self._write_storyboard()

        references = ComicBrainProjectService.resolve_character_references(
            "series-one",
            "ch001",
        )
        self.assertEqual([], references)

    def test_explicit_canonical_markers_are_accepted(self):
        # Legacy packages without snapshot_hash may use explicitly named
        # canonical fields that predate per-file sha256 metadata.
        self.storyboard["source"].pop("snapshot_hash")
        filenames = [
            "kind.png",
            "status.png",
            "flag.png",
            "named-field.png",
            "named-list.png",
            "ordinary-kind.png",
            "ordinary-status.png",
        ]
        for filename in filenames:
            (self.reference_path.parent / filename).write_bytes(filename.encode("utf-8"))

        self.storyboard["characters"] = [
            {
                "name": "Kind",
                "reference_images": [
                    {
                        "path": "wiki/assets/kind.png",
                        "kind": "canonical-image-source",
                    }
                ],
            },
            {
                "name": "Status",
                "reference_images": [
                    {
                        "path": "wiki/assets/status.png",
                        "status": "confirmed",
                    }
                ],
            },
            {
                "name": "Flag",
                "reference_images": [
                    {
                        "path": "wiki/assets/flag.png",
                        "canonical": True,
                    }
                ],
            },
            {
                "name": "Named",
                "canonical_reference_path": "wiki/assets/named-field.png",
                "canonical_reference_paths": ["wiki/assets/named-list.png"],
            },
            {
                "name": "OrdinaryKind",
                "reference_image": "wiki/assets/ordinary-kind.png",
                "reference_kind": "canonical-image-source",
            },
            {
                "name": "OrdinaryStatus",
                "reference_image": {
                    "path": "wiki/assets/ordinary-status.png",
                    "status": "canonical",
                },
            },
        ]
        self._write_storyboard()

        references = ComicBrainProjectService.resolve_character_references(
            "series-one",
            "ch001",
        )
        self.assertEqual(
            [
                ("Kind", str((self.reference_path.parent / "kind.png").resolve())),
                ("Status", str((self.reference_path.parent / "status.png").resolve())),
                ("Flag", str((self.reference_path.parent / "flag.png").resolve())),
                ("Named", str((self.reference_path.parent / "named-field.png").resolve())),
                ("Named", str((self.reference_path.parent / "named-list.png").resolve())),
                (
                    "OrdinaryKind",
                    str((self.reference_path.parent / "ordinary-kind.png").resolve()),
                ),
                (
                    "OrdinaryStatus",
                    str((self.reference_path.parent / "ordinary-status.png").resolve()),
                ),
            ],
            references,
        )

    def test_comicbrain_references_replace_bundled_style_characters(self):
        captured = {}

        def fake_generate_with_reference_fallbacks(**kwargs):
            captured.setdefault("reference_sets", []).append(kwargs["reference_sets"])
            return "/static/images/generated.png"

        with (
            patch.object(
                ImageService,
                "get_style_reference_images",
                return_value=[("bundled", "/tmp/bundled.png")],
            ) as bundled_references,
            patch.object(
                ImageService,
                "_generate_with_reference_fallbacks",
                side_effect=fake_generate_with_reference_fallbacks,
            ),
        ):
            ImageService.generate_comic_image(
                page_data=self.storyboard["pages"][0],
                comic_style="doraemon",
                image_provider="google",
                google_api_key="fake",
                character_references=[
                    ("主角", str(self.reference_path.resolve())),
                ],
            )
            ImageService.generate_comic_image(
                page_data={
                    "title": "Landscape",
                    "rows": [{"panels": [{"text": "空无一人的山谷。"}]}],
                },
                comic_style="doraemon",
                image_provider="google",
                google_api_key="fake",
                character_references=[],
            )

        external_reference_set = captured["reference_sets"][0][0]
        empty_selected_reference_set = captured["reference_sets"][1][0]
        self.assertIn(str(self.reference_path.resolve()), external_reference_set)
        self.assertNotIn("/tmp/bundled.png", external_reference_set)
        self.assertIsNone(empty_selected_reference_set)
        bundled_references.assert_not_called()

        captured_cover = {}

        def fake_cover_generation(prompt, reference_img=None, **kwargs):
            captured_cover["references"] = list(reference_img or [])
            return "/static/images/cover.png"

        with (
            patch.object(
                ImageService,
                "get_style_reference_images",
                return_value=[("bundled", "/tmp/bundled.png")],
            ),
            patch.object(
                image_service_module,
                "generate_social_media_image_core",
                side_effect=fake_cover_generation,
            ),
        ):
            ImageService.generate_comic_cover(
                comic_style="doraemon",
                image_provider="google",
                google_api_key="fake",
                character_references=[
                    ("主角", str(self.reference_path.resolve())),
                ],
            )

        self.assertEqual(
            [str(self.reference_path.resolve())],
            captured_cover["references"],
        )

    def test_reference_style_uses_neutral_locked_asset_description(self):
        description = ImageService.get_safe_style_description("reference")
        self.assertIn("locked character and reference images", description)
        self.assertIn("without introducing", description)
        self.assertNotEqual("reference", description)


if __name__ == "__main__":
    unittest.main()
