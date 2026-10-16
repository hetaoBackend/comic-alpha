import os
import sys
import unittest
import json
import io
from pathlib import Path
import base64


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

from PIL import Image  # noqa: E402
import comic_generator as comic_generator_module  # noqa: E402
from comic_generator import (  # noqa: E402
    _aspect_ratio_for_size,
    _generated_image_to_png_bytes,
    _save_generated_image,
    GeneratedImageAspectRatioError,
    _normalize_generated_image_size,
)
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

    def test_saved_image_is_normalized_to_requested_mobile_canvas(self):
        source = Image.new("RGB", (640, 480), "red")
        buffer = io.BytesIO()
        source.save(buffer, format="PNG")

        image_url = _save_generated_image(
            buffer.getvalue(),
            target_size="1024x1536",
        )
        output = Path(BACKEND_DIR) / image_url.removeprefix("/backend/")
        try:
            with Image.open(output) as normalized:
                self.assertEqual((1024, 1536), normalized.size)
                self.assertEqual("PNG", normalized.format)
        finally:
            output.unlink(missing_ok=True)

        self.assertEqual("2:3", _aspect_ratio_for_size("1024x1536"))

    def test_generated_image_size_accepts_near_match_without_resizing(self):
        source = io.BytesIO()
        Image.new("RGB", (1023, 1537), "white").save(source, format="PNG")

        normalized = _normalize_generated_image_size(source.getvalue(), "1024x1536")

        with Image.open(io.BytesIO(normalized)) as result:
            self.assertEqual((1023, 1537), result.size)

    def test_generated_image_size_rejects_wrong_orientation(self):
        source = io.BytesIO()
        Image.new("RGB", (1536, 1024), "white").save(source, format="PNG")

        with self.assertRaises(GeneratedImageAspectRatioError):
            _normalize_generated_image_size(source.getvalue(), "1024x1536")

    def test_codex_image_generation_retries_wrong_aspect_ratio(self):
        def png_bytes(size):
            buffer = io.BytesIO()
            Image.new("RGB", size, "white").save(buffer, format="PNG")
            return buffer.getvalue()

        def sse_response(image_bytes):
            event = {
                "type": "response.output_item.done",
                "item": {
                    "type": "image_generation_call",
                    "result": base64.b64encode(image_bytes).decode("ascii"),
                },
            }

            class FakeResponse:
                status_code = 200
                text = f"data: {json.dumps(event)}\n\ndata: [DONE]"

            return FakeResponse()

        responses = [
            sse_response(png_bytes((1536, 1024))),
            sse_response(png_bytes((1024, 1536))),
        ]
        request_bodies = []

        def fake_post(url, headers=None, json=None, timeout=None):
            request_bodies.append(json)
            return responses.pop(0)

        original_token = comic_generator_module._resolve_codex_access_token
        original_post = comic_generator_module.requests.post
        original_save = comic_generator_module._save_generated_image
        comic_generator_module._resolve_codex_access_token = lambda: "fake-token"
        comic_generator_module.requests.post = fake_post
        comic_generator_module._save_generated_image = lambda image_bytes: "/backend/static/images/fake.png"
        try:
            result = comic_generator_module.generate_codex_image_core(
                prompt="Create a comic page.",
                size="1024x1536",
                max_retries=2,
                retry_delay=0,
            )
        finally:
            comic_generator_module._resolve_codex_access_token = original_token
            comic_generator_module.requests.post = original_post
            comic_generator_module._save_generated_image = original_save

        self.assertEqual("/backend/static/images/fake.png", result)
        self.assertEqual(2, len(request_bodies))
        self.assertEqual('gpt-6.1-sol', request_bodies[0]['model'])
        self.assertEqual('gpt-image-2', request_bodies[0]['tools'][0]['model'])
        retry_text = request_bodies[1]["input"][0]["content"][0]["text"]
        self.assertIn("CRITICAL RETRY CORRECTION", retry_text)
        self.assertIn("exactly 1024x1536", retry_text)

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

    def test_image_prompt_locks_mobile_portrait_canvas(self):
        prompt = ImageService._convert_page_to_prompt(
            {
                "title": "Mobile page",
                "canvas": {
                    "width": 1024,
                    "height": 1536,
                    "aspect_ratio": "2:3",
                },
                "rows": [
                    {"height": "auto", "weight": 1, "panels": [{"text": "one"}]},
                    {"height": "auto", "weight": 1, "panels": [{"text": "two"}]},
                ],
            },
            "reference",
            "zh",
        )
        payload = json.loads(prompt)["image_generation_data"]
        combined = payload["prompt"] + "\n" + payload["requirements"]
        self.assertIn("EXACTLY 1024x1536 pixels", combined)
        self.assertIn("never return a landscape page", combined)

    def test_codex_brightness_guidance_separates_reference_identity_from_exposure(self):
        base_prompt = ImageService._convert_page_to_prompt(
            {
                "title": "A sunny day",
                "rows": [{"panels": [{"text": "A character walks outside."}]}],
            },
            "nezha",
            "en",
        )

        guided_prompt = ImageService._add_codex_brightness_guidance(base_prompt)
        payload = json.loads(guided_prompt)["image_generation_data"]

        self.assertIn("BRIGHTNESS / EXPOSURE LOCK", payload["requirements"])
        self.assertIn("Their exposure", payload["requirements"])
        self.assertIn("motivated fill light or rim light", payload["requirements"])
        self.assertIn("underexposure", payload["negative_prompt"])
        self.assertIn("crushed blacks", payload["negative_prompt"])

    def test_codex_generation_gets_brightness_guidance_but_google_does_not(self):
        prompts = []

        def fake_generate_with_reference_fallbacks(**kwargs):
            prompts.append(kwargs["prompt"])
            return "/backend/static/images/fake.png"

        original = ImageService._generate_with_reference_fallbacks
        ImageService._generate_with_reference_fallbacks = staticmethod(fake_generate_with_reference_fallbacks)
        try:
            page_data = {
                "title": "Page",
                "rows": [{"panels": [{"text": "An original character waves."}]}],
            }
            ImageService.generate_comic_image(
                page_data=page_data,
                comic_style="watercolor",
                image_provider="codex",
            )
            ImageService.generate_comic_image(
                page_data=page_data,
                comic_style="watercolor",
                image_provider="google",
                google_api_key="fake",
            )
        finally:
            ImageService._generate_with_reference_fallbacks = original

        codex_payload = json.loads(prompts[0])["image_generation_data"]
        google_payload = json.loads(prompts[1])["image_generation_data"]
        self.assertIn("BRIGHTNESS / EXPOSURE LOCK", codex_payload["requirements"])
        self.assertNotIn("BRIGHTNESS / EXPOSURE LOCK", google_payload["requirements"])
        self.assertIn("OUTPUT CANVAS LOCK", codex_payload["requirements"])
        self.assertIn("exactly 1024x1536", codex_payload["requirements"])
        self.assertNotIn("OUTPUT CANVAS LOCK", google_payload["requirements"])

    def test_codex_brightness_guidance_supports_plain_text_cover_prompts(self):
        guided_prompt = ImageService._add_codex_brightness_guidance(
            "Create a vertical comic cover."
        )

        self.assertIn("Create a vertical comic cover.", guided_prompt)
        self.assertIn("# Codex Rendering Requirements", guided_prompt)
        self.assertIn("BRIGHTNESS / EXPOSURE LOCK", guided_prompt)

    def test_codex_canvas_guidance_supports_plain_text_cover_prompts(self):
        guided_prompt = ImageService._add_codex_canvas_guidance(
            "Create a vertical comic cover.",
            "1024x1536",
        )

        self.assertIn("Create a vertical comic cover.", guided_prompt)
        self.assertIn("OUTPUT CANVAS LOCK", guided_prompt)
        self.assertIn("portrait orientation", guided_prompt)

    def test_codex_cover_always_uses_standard_portrait_size(self):
        captured = {}

        def fake_generate_codex_image_core(prompt, **kwargs):
            captured["prompt"] = prompt
            captured.update(kwargs)
            return "/backend/static/images/fake-cover.png"

        original = image_service_module.generate_codex_image_core
        image_service_module.generate_codex_image_core = fake_generate_codex_image_core
        try:
            image_url, _ = ImageService.generate_comic_cover(
                comic_style="watercolor",
                image_provider="codex",
                image_size="1536x1024",
            )
        finally:
            image_service_module.generate_codex_image_core = original

        self.assertEqual("/backend/static/images/fake-cover.png", image_url)
        self.assertEqual("1024x1536", captured["size"])
        self.assertIn("exactly 1024x1536", captured["prompt"])
        self.assertIn("portrait orientation", captured["prompt"])

    def test_codex_cover_replaces_auto_size_with_standard_portrait_size(self):
        self.assertEqual(
            "1024x1536",
            ImageService._lock_codex_cover_image_size("auto"),
        )

    def test_codex_page_size_uses_previous_page_orientation(self):
        original = ImageService._generated_page_image_dimensions
        ImageService._generated_page_image_dimensions = staticmethod(
            lambda image_url: (1024, 1536)
        )
        try:
            locked_size = ImageService._lock_image_size_to_previous_pages(
                "1536x1024",
                [{"imageUrl": "/backend/static/images/previous.png"}],
            )
        finally:
            ImageService._generated_page_image_dimensions = staticmethod(original)

        self.assertEqual("1024x1536", locked_size)

    def test_codex_page_size_keeps_matching_previous_page_orientation(self):
        original = ImageService._generated_page_image_dimensions
        ImageService._generated_page_image_dimensions = staticmethod(
            lambda image_url: (1023, 1537)
        )
        try:
            locked_size = ImageService._lock_image_size_to_previous_pages(
                "1024x1536",
                [{"imageUrl": "/backend/static/images/previous.png"}],
            )
        finally:
            ImageService._generated_page_image_dimensions = staticmethod(original)

        self.assertEqual("1024x1536", locked_size)

    def test_codex_page_size_uses_series_majority_instead_of_one_bad_page(self):
        sizes = {
            "page1.png": (1024, 1536),
            "page2.png": (1023, 1537),
            "page3.png": (1024, 1536),
            "page4.png": (1536, 1024),
        }
        original = ImageService._generated_page_image_dimensions
        ImageService._generated_page_image_dimensions = staticmethod(
            lambda image_url: sizes[image_url.rsplit("/", 1)[-1]]
        )
        try:
            locked_size = ImageService._lock_image_size_to_previous_pages(
                "1536x1024",
                [
                    {"imageUrl": f"/backend/static/images/page{i}.png"}
                    for i in range(1, 5)
                ],
            )
        finally:
            ImageService._generated_page_image_dimensions = staticmethod(original)

        self.assertEqual("1024x1536", locked_size)

    def test_codex_generation_uses_series_locked_size_for_prompt_and_provider(self):
        captured = {}

        def fake_generate_with_reference_fallbacks(**kwargs):
            captured.update(kwargs)
            return "/backend/static/images/fake.png"

        original_dimensions = ImageService._generated_page_image_dimensions
        original_generate = ImageService._generate_with_reference_fallbacks
        ImageService._generated_page_image_dimensions = staticmethod(
            lambda image_url: (1024, 1536)
        )
        ImageService._generate_with_reference_fallbacks = staticmethod(
            fake_generate_with_reference_fallbacks
        )
        try:
            ImageService.generate_comic_image(
                page_data={
                    "title": "Page 7",
                    "rows": [{"panels": [{"text": "The race ends."}]}],
                },
                comic_style="watercolor",
                image_provider="codex",
                image_size="1536x1024",
                extra_body=[
                    {"imageUrl": "/backend/static/images/page6.png"}
                ],
            )
        finally:
            ImageService._generated_page_image_dimensions = staticmethod(original_dimensions)
            ImageService._generate_with_reference_fallbacks = staticmethod(original_generate)

        self.assertEqual("1024x1536", captured["image_size"])
        prompt_payload = json.loads(captured["prompt"])["image_generation_data"]
        self.assertIn("exactly 1024x1536", prompt_payload["requirements"])

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
