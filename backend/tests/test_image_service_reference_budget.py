import os
import sys
import unittest
import json


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

from PIL import Image  # noqa: E402
from comic_generator import _generated_image_to_png_bytes  # noqa: E402
from services.comic_service import ComicService  # noqa: E402
from services import image_service as image_service_module  # noqa: E402
from services.image_service import ImageService  # noqa: E402


class ImageServiceReferenceBudgetTest(unittest.TestCase):
    def test_generated_image_to_png_bytes_supports_pil_images(self):
        img = Image.new("RGB", (2, 2), "red")
        data = _generated_image_to_png_bytes(img)
        self.assertEqual(b"\x89PNG\r\n\x1a\n", data[:8])

    def test_generated_image_to_png_bytes_supports_genai_image_save_signature(self):
        class GenAIImageLike:
            def save(self, fp, image_format=None):
                if image_format != "PNG":
                    raise ValueError("expected PNG image_format")
                img = Image.new("RGB", (2, 2), "blue")
                img.save(fp, format=image_format)

        data = _generated_image_to_png_bytes(GenAIImageLike())
        self.assertEqual(b"\x89PNG\r\n\x1a\n", data[:8])

    def test_comic_script_normalization_caps_rows_for_all_row_counts(self):
        service = ComicService()
        pages = [{
            "title": "Page",
            "rows": [
                {"height": "250px", "panels": [{"text": "one"}]},
                {"height": "250px", "panels": [{"text": "two"}]},
                {"height": "250px", "panels": [{"text": "three"}]},
            ],
        }]

        normalized = service._normalize_generated_pages(pages, 2)
        self.assertEqual(2, len(normalized[0]["rows"]))
        self.assertEqual("two；three", normalized[0]["rows"][1]["panels"][0]["text"])

    def test_image_prompt_locks_exact_two_row_layout(self):
        prompt = ImageService._convert_page_to_prompt(
            {
                "title": "Page",
                "rows": [
                    {"height": "250px", "panels": [{"text": "one"}]},
                    {"height": "250px", "panels": [{"text": "two"}]},
                ],
            },
            "doraemon",
            "en",
        )
        payload = json.loads(prompt)["image_generation_data"]
        combined = payload["prompt"] + "\n" + payload["requirements"] + "\n" + payload["negative_prompt"]

        self.assertIn("EXACTLY 2 top-level horizontal row band(s)", combined)
        self.assertIn("Use exactly 1 horizontal gutter line(s)", combined)
        self.assertIn("Do NOT invent a third row", combined)

    def test_generate_image_enforces_rows_per_page_before_prompting(self):
        captured = {}

        def fake_generate_with_reference_fallbacks(**kwargs):
            captured["prompt"] = kwargs["prompt"]
            return "/backend/static/images/fake.png"

        original = ImageService._generate_with_reference_fallbacks
        ImageService._generate_with_reference_fallbacks = staticmethod(fake_generate_with_reference_fallbacks)
        try:
            image_url, _ = ImageService.generate_comic_image(
                page_data={
                    "title": "Page",
                    "rows": [
                        {"height": "250px", "panels": [{"text": "one"}]},
                        {"height": "250px", "panels": [{"text": "two"}]},
                        {"height": "250px", "panels": [{"text": "three"}]},
                    ],
                },
                comic_style="doraemon",
                rows_per_page="2",
                image_provider="google",
                google_api_key="fake",
            )
        finally:
            ImageService._generate_with_reference_fallbacks = original

        self.assertEqual("/backend/static/images/fake.png", image_url)
        payload = json.loads(captured["prompt"])["image_generation_data"]
        self.assertIn("EXACTLY 2 top-level horizontal row band(s)", payload["requirements"])
        self.assertIn("Row 2: 1 panel(s)", payload["prompt"])
        self.assertIn("two；three", payload["prompt"])
        self.assertNotIn("Row 3:", payload["prompt"])

    def test_alias_metadata_selects_matching_reference_images(self):
        lang_refs = ImageService.get_style_reference_images("langlangshan")
        selected_lang = ImageService._select_relevant_reference_images(
            {"rows": [{"panels": [{"text": "小猪妖扛着竹筐穿过浪浪山。"}]}]},
            lang_refs,
            "langlangshan",
            fallback_to_all=False,
        )
        self.assertEqual(["猪妖"], [name for name, _ in selected_lang])

        nezha_matches = ImageService.resolve_reference_characters("nezha", "三太子和东海龙王在海边对峙")
        self.assertCountEqual(["哪吒", "敖光"], [item["reference_name"] for item in nezha_matches])

    def test_missing_metadata_still_uses_reference_filenames(self):
        original_refs = ImageService.get_style_reference_images
        original_meta = ImageService._load_reference_character_meta
        try:
            ImageService.get_style_reference_images = staticmethod(
                lambda comic_style: [("甲角色", "/tmp/alpha.png"), ("乙角色", "/tmp/beta.png")]
            )
            ImageService._load_reference_character_meta = staticmethod(lambda comic_style: [])

            matches = ImageService.resolve_reference_characters("synthetic", "甲角色准备出发")
            selected = ImageService._select_relevant_reference_images(
                {"rows": [{"panels": [{"text": "乙角色在终点等待。"}]}]},
                ImageService.get_style_reference_images("synthetic"),
                "synthetic",
                fallback_to_all=False,
            )
        finally:
            ImageService.get_style_reference_images = original_refs
            ImageService._load_reference_character_meta = original_meta

        self.assertEqual(["甲角色"], [item["reference_name"] for item in matches])
        self.assertEqual(["乙角色"], [name for name, _ in selected])

    def test_codex_filters_style_references_and_caps_previous_pages(self):
        captured = {}

        def fake_generate_codex_image_core(prompt, reference_img=None, **kwargs):
            captured["reference_img"] = list(reference_img or [])
            return "/backend/static/images/fake.png"

        original = image_service_module.generate_codex_image_core
        image_service_module.generate_codex_image_core = fake_generate_codex_image_core
        try:
            image_url, _ = ImageService.generate_comic_image(
                page_data={
                    "title": "哪吒闹海",
                    "rows": [
                        {
                            "panels": [
                                {"text": "哪吒站在海边，举起火尖枪。"}
                            ]
                        }
                    ],
                },
                comic_style="nezha",
                reference_img="data:image/png;base64,layout",
                extra_body=[
                    {"imageUrl": "/backend/static/images/page1.png"},
                    {"imageUrl": "/backend/static/images/page2.png"},
                    {"imageUrl": "/backend/static/images/page3.png"},
                    {"imageUrl": "/backend/static/images/page4.png"},
                ],
                image_provider="codex",
                image_model="gpt-image-2",
                image_size="1024x1536",
                image_quality="medium",
            )
        finally:
            image_service_module.generate_codex_image_core = original

        self.assertEqual(image_url, "/backend/static/images/fake.png")
        refs = captured["reference_img"]

        style_refs = [
            ref for ref in refs
            if ref.startswith(os.path.join(PROJECT_ROOT, "assets", "refer_image", "nezha"))
        ]
        previous_page_refs = [
            ref for ref in refs
            if ref.startswith("/backend/static/images/")
        ]

        self.assertEqual(1, len(style_refs))
        self.assertTrue(style_refs[0].endswith("哪吒.jpg"))
        self.assertEqual(
            ["/backend/static/images/page3.png", "/backend/static/images/page4.png"],
            previous_page_refs,
        )


if __name__ == "__main__":
    unittest.main()
