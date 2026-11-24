import sys
import unittest
import json
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.social_media_service import SocialMediaService


class SocialMediaTest(unittest.TestCase):
    def setUp(self):
        self.service = SocialMediaService(text_provider="codex")
        self.pages = [{"title": f"页面{i}", "rows": [{"panels": [{"text": f"第{i}页真实对白"}]}]} for i in range(1, 11)]

    def test_accepts_current_frontend_envelope_and_keeps_ending(self):
        summary = self.service._extract_comic_summary({"title": "代理班长只有十分钟", "pages": self.pages})
        self.assertIn("代理班长只有十分钟", summary)
        for page in self.pages:
            self.assertIn(page["rows"][0]["panels"][0]["text"], summary)

    def test_legacy_page_and_array_are_supported(self):
        for value in (self.pages[0], self.pages):
            self.assertIn("第1页真实对白", self.service._extract_comic_summary(value))

    def test_empty_story_does_not_generate_generic_filler(self):
        for value in ({"pages": []}, {}, [{"title": "只有标题"}]):
            with self.assertRaises(ValueError):
                self.service._extract_comic_summary(value)

    @patch("services.social_media_service.generate_codex_text_core")
    def test_generation_uses_story_and_returns_separate_author_comment(self, generate):
        generate.return_value = json.dumps({"title": "班长", "content": "敖丙的记名本", "tags": ["漫画"], "comment": "你会怎么做？"})
        for platform in ("xiaohongshu", "twitter"):
            result = self.service.generate_social_content({"title": "代理班长", "pages": self.pages}, platform)
            self.assertIn("第10页真实对白", generate.call_args.kwargs["user_prompt"])
            self.assertIn("不要编造", generate.call_args.kwargs["system_prompt"])
            self.assertEqual(result["comment"], "你会怎么做？")
            self.assertEqual(result["schemaVersion"], 2)
            self.assertEqual(result["platform"], platform)

    @patch("services.social_media_service.generate_codex_text_core")
    def test_overlong_copy_is_rewritten_instead_of_truncated(self, generate):
        long_copy = {"title": "班长", "content": "长" * 61, "tags": [], "comment": "你会怎么选？"}
        short_copy = {**long_copy, "content": "同学只想借块橡皮，哪吒却忙着扩编班干部。"}
        generate.side_effect = [json.dumps(long_copy), json.dumps(short_copy)]
        result = self.service.generate_social_content(self.pages)
        self.assertEqual(generate.call_count, 2)
        self.assertEqual(result["content"], short_copy["content"])
        self.assertIn("长" * 61, generate.call_args.kwargs["user_prompt"])

    @patch("services.social_media_service.generate_codex_text_core")
    def test_still_overlong_copy_fails_after_one_rewrite(self, generate):
        generate.return_value = json.dumps({"title": "长" * 21, "content": "短正文", "tags": [], "comment": "你会怎么选？"})
        with self.assertRaisesRegex(ValueError, "长度要求"):
            self.service.generate_social_content(self.pages)
        self.assertEqual(generate.call_count, 2)
