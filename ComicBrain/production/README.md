---
id: comicbrain-production-guide
type: production-guide
status: draft
updated: 2026-08-02
---

# Production 制作工作区

`production/` 是从 `wiki/` 编译出来、供漫画制作工具消费的非正史工作区。这里的文件可以重建、替换和人工调整，但不能反过来充当剧情事实或正史证据。

## 每章目录

```text
production/<series-id>/<chapter-id>/
├── storyboard.json   # ComicBrain 正史/草稿源在某次导出时的制作快照
├── review.json       # comic-alpha 中人工调整后的制作草稿
├── renders/
│   └── manifest.json # comic-alpha 保存的页码—成图版本映射
└── cover/            # 可选预留：归档生成的封面
```

- `storyboard.json` 由导出器原子写入，记录脚本来源、脚本 SHA-256、独立封面描述来源与 SHA-256、完整派生快照 SHA-256 与导出时间。comic-alpha 用 `source.snapshot_hash` 判断旧 `review.json` 是否已经落后；`source.source_hash` 专门校验脚本原文。重新导出会覆盖来源快照。
- `review.json` 由 comic-alpha 保存，表示人工调整过的制作草稿；它不是正史，也不自动回写 `wiki/`。
- `renders/manifest.json` 由 comic-alpha 在每次章节页面生图成功后原子更新，记录页 ID、页面脚本指纹、成图 URL 与版本。再次载入分镜或更换浏览器会从此恢复页面成图；实际图片文件仍在 comic-alpha 的 `backend/static/images/`。
- `renders/` 与 `cover/` 中的记录仍是可再生制作资产，不会因为生成成功而成为视觉或剧情正史。
- 如果制作过程提出剧情修改，应回到 ComicBrain 对话中确认；确认后仍按“先写 `wiki/证据/`，再更新当前知识”的协议执行。

## 导出

从 ComicBrain 根目录运行：

```bash
python3 .agents/skills/comic-wiki/scripts/export_comic_alpha.py \
  --series-id <series-id> \
  --chapter-id <chapter-id>
```

检查来源能否解析、现有快照是否仍与来源一致：

```bash
python3 .agents/skills/comic-wiki/scripts/export_comic_alpha.py \
  --series-id <series-id> \
  --chapter-id <chapter-id> \
  --check
```

`--check` 只在内存中重新编译并核对已有快照，不会写文件。每章脚本必须有同目录 `04-封面描述.md`；导出器会把其中的两行标题与描述编译为专用封面 brief，不再默认使用正文第一格。

导出的契约版本是 `comicbrain-alpha/1`。每个来源“画面/格”会成为独立的一行一格，人物参考图只会取用系列 `assets/index.md` 中已经登记为正史来源的文件。普通故事页固定使用 `1024×1536`、`2:3` 手机竖版画布；各行以相同 `weight` 平分可用高度，不再因格数而累加固定像素高度。

## `storyboard.json` 契约

```text
schema_version
artifact_status
source
  series_id, chapter_id, status, source_id, source_file
  source_hash, snapshot_hash, source_updated_at, exported_at
title
series_title
settings
  language, comic_style, layout, cover_mode
  image_size, canvas_aspect_ratio, output_format
characters[]
  id, name, aliases, reference_images[]
pages[]
  id, title, character_names[], canvas, source
  rows[]
    id, height, weight
    panels[1]
      id, text, character_names[], cover_candidate, source
cover
  mode, title, brief
  source
    id, file, hash, updated_at
```

每个 `reference_images[]` 条目都带素材文件自身的 `sha256`；因此人物图内容、资产登记、人物集合、布局、面板文本、封面描述或制作设置的任一变化，都会改变 `source.snapshot_hash`。`comic_style: reference` 表示优先跟随已确认参考图的既有画风，不套用 comic-alpha 的其他 IP 风格。角色身份通常来自 `canonical` 人物档案；若档案整体仍为 `draft`，但资产登记已经存在该角色的 `canonical-image-source` 或 `canonical-lineup-source`，导出器只读取档案的角色 ID 与标题来绑定正式图片，不会把档案中的其他草稿内容编译进 production。`pages[].canvas` 是前端草图和后端成图共同遵守的画幅来源；当前普通页只接受 `1024×1536`。`source.line` 均为原 Markdown 文件的 1-based 行号；`pages[].character_names` 是本页各格人物集合，`panels[].character_names` 与写入 `text` 的规范名只来自该格正文，避免把整页人物误塞进每一格。`cover.source` 指向独立封面描述文件，漫画工具会直接把 `cover.title` 与 `cover.brief` 合并进封面生成要求。
