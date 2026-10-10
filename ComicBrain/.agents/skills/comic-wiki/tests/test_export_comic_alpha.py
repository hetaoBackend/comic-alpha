from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "export_comic_alpha.py"
)
SPEC = importlib.util.spec_from_file_location("export_comic_alpha", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
EXPORTER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = EXPORTER
SPEC.loader.exec_module(EXPORTER)


class ExportableProfileNamesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.series_dir = Path(self.temporary.name)
        (self.series_dir / "人物").mkdir()
        (self.series_dir / "assets").mkdir()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_profile(
        self, character_id: str, name: str, status: str = "draft"
    ) -> None:
        (self.series_dir / "人物" / f"{character_id}-{name}.md").write_text(
            "\n".join(
                [
                    "---",
                    f'id: "test-{character_id}"',
                    "type: character",
                    'series: "test"',
                    f'character_id: "{character_id}"',
                    f"status: {status}",
                    'updated: "2026-08-02"',
                    "---",
                    "",
                    f"# {name}",
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def write_assets(self, rows: list[str]) -> None:
        (self.series_dir / "assets" / "index.md").write_text(
            "\n".join(
                [
                    "| 资产 ID | 人物/场景 | 路径 | 用途级别 | 版本 | 来源 | 正史状态 |",
                    "|---|---|---|---|---|---|---|",
                    *rows,
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def test_draft_profile_with_canonical_image_is_exportable(self) -> None:
        self.write_profile("c001", "哪吒")
        self.write_assets(
            [
                "| asset-c001 | 哪吒 | `人物/c001/ref.png` | 正史形象 | v001 | test | canonical-image-source |"
            ]
        )

        self.assertEqual(
            EXPORTER.load_profile_names(self.series_dir),
            {"c001": "哪吒"},
        )

    def test_draft_profile_without_canonical_image_stays_excluded(self) -> None:
        self.write_profile("c001", "哪吒")
        self.write_assets(
            [
                "| asset-c001 | 哪吒 | `人物/c001/ref.png` | 草图 | v001 | test | 待审，非正史 |"
            ]
        )

        self.assertEqual(EXPORTER.load_profile_names(self.series_dir), {})

    def test_canonical_profile_remains_exportable_without_image(self) -> None:
        self.write_profile("c001", "哪吒", status="canonical")
        self.write_assets([])

        self.assertEqual(
            EXPORTER.load_profile_names(self.series_dir),
            {"c001": "哪吒"},
        )


if __name__ == "__main__":
    unittest.main()
