import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT))

from serve_frontend import resolve_public_file  # noqa: E402


class FrontendServerAllowlistTest(unittest.TestCase):
    def test_public_frontend_files_are_available(self):
        self.assertEqual(
            REPOSITORY_ROOT / "index.html",
            resolve_public_file("/"),
        )
        self.assertEqual(
            REPOSITORY_ROOT / "frontend" / "css" / "style.css",
            resolve_public_file("/frontend/css/style.css?v=13"),
        )
        self.assertEqual(
            REPOSITORY_ROOT / "assets" / "favicon.jpeg",
            resolve_public_file("/assets/favicon.jpeg"),
        )
        generated_images_dir = (
            REPOSITORY_ROOT / "backend" / "static" / "images"
        )
        with tempfile.NamedTemporaryFile(
            dir=generated_images_dir,
            suffix=".png",
        ) as generated_image:
            generated_image_path = Path(generated_image.name).resolve()
            self.assertEqual(
                generated_image_path,
                resolve_public_file(
                    f"/backend/static/images/{generated_image_path.name}"
                ),
            )

    def test_repository_and_comicbrain_files_are_denied(self):
        for request_target in (
            "/ComicBrain/index.md",
            "/ComicBrain/raw/剧情决策日志.md",
            "/.git/config",
            "/.env",
            "/README.md",
            "/backend/app.py",
            "/backend/static/",
            "/frontend/../ComicBrain/index.md",
            "/frontend/%2e%2e/ComicBrain/index.md",
        ):
            with self.subTest(request_target=request_target):
                self.assertIsNone(resolve_public_file(request_target))

    def test_directories_are_not_listed(self):
        self.assertIsNone(resolve_public_file("/frontend/"))
        self.assertIsNone(resolve_public_file("/assets/"))


if __name__ == "__main__":
    unittest.main()
