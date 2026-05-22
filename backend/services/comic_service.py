import json
import re
from typing import List, Dict, Any, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from google import genai
from google.genai import types


class DialogueLine(BaseModel):
    speaker: str = Field(default="", description="说话角色名")
    text: str = Field(default="", description="短对白，适合漫画气泡")


class Panel(BaseModel):
    text: str = Field(default="", description="兼容旧版的一段式分镜描述")
    shot: str = Field(default="", description="镜头类型，例如 远景/中景/特写/俯视")
    location_id: str = Field(default="", description="场景 ID，来自 story_bible.locations")
    characters: List[str] = Field(default_factory=list, description="本格出现的角色 ID 列表，来自 story_bible.characters")
    action: str = Field(default="", description="本格可见动作")
    emotion: str = Field(default="", description="角色主要情绪")
    dialogue: List[DialogueLine] = Field(default_factory=list, description="本格对白列表")
    visual_notes: str = Field(default="", description="非外貌类视觉提示，例如构图、道具、光线、场景状态")
    negative_notes: str = Field(default="", description="本格禁止出现或禁止改变的内容")


class Row(BaseModel):
    height: str = Field(description="行高度，例如 '180px'")
    panels: List[Panel]

class ComicPage(BaseModel):
    title: str = Field(description="页标题")
    rows: List[Row]


class CharacterAsset(BaseModel):
    id: str = Field(description="稳定角色 ID，例如 rabbit_hero")
    name: str = Field(description="角色显示名")
    role: str = Field(default="", description="故事功能或关系")
    reference_image: str = Field(default="", description="匹配到的参考图文件名或路径")
    appearance_rule: str = Field(default="Use reference image only", description="外貌/服装规则")
    personality: str = Field(default="", description="性格与表演风格")
    forbidden_changes: List[str] = Field(default_factory=list, description="禁止改变项")


class LocationAsset(BaseModel):
    id: str = Field(description="稳定场景 ID")
    name: str = Field(description="场景名")
    layout: str = Field(default="", description="空间布局、镜头方向、固定物件")
    lighting: str = Field(default="", description="时间、光线、色彩氛围")
    fixed_props: List[str] = Field(default_factory=list, description="必须保持一致的道具")
    forbidden_changes: List[str] = Field(default_factory=list, description="禁止变化项")


class PropAsset(BaseModel):
    id: str = Field(description="稳定道具 ID")
    name: str = Field(description="道具名")
    description: str = Field(default="", description="外观与用途")
    owner: str = Field(default="", description="所属角色或场景")


class StoryBible(BaseModel):
    logline: str = Field(default="", description="一句话故事")
    tone: str = Field(default="", description="整体情绪和节奏")
    visual_rules: List[str] = Field(default_factory=list, description="全局视觉规则")
    forbidden_details: List[str] = Field(default_factory=list, description="全局禁止事项")
    characters: List[CharacterAsset] = Field(default_factory=list)
    locations: List[LocationAsset] = Field(default_factory=list)
    props: List[PropAsset] = Field(default_factory=list)


class ContinuitySummary(BaseModel):
    page: int = Field(description="页码，从 1 开始")
    location_state: str = Field(default="", description="本页结束时的场景状态")
    character_state: str = Field(default="", description="本页结束时角色位置、动作、情绪状态")
    prop_state: str = Field(default="", description="关键道具状态")
    next_requirements: str = Field(default="", description="下一页必须继承的连续性要求")


class ScriptReviewIssue(BaseModel):
    severity: str = Field(default="info", description="info/warning/error")
    location: str = Field(default="", description="问题所在页/格")
    message: str = Field(default="", description="问题说明")
    suggestion: str = Field(default="", description="修改建议")


class ComicScript(BaseModel):
    pages: List[ComicPage] = Field(description="漫画面板页面列表")
    story_bible: StoryBible = Field(default_factory=StoryBible, description="角色、场景、道具和视觉规则")
    continuity_summaries: List[ContinuitySummary] = Field(default_factory=list, description="逐页连续性摘要")
    review_notes: List[ScriptReviewIssue] = Field(default_factory=list, description="自动审稿结果")


class StoryIdea(BaseModel):
    title: str = Field(description="方向标题")
    logline: str = Field(description="一句话故事方向")
    characters: List[str] = Field(default_factory=list, description="建议角色")
    conflict: str = Field(default="", description="核心冲突")
    ending: str = Field(default="", description="结尾或反转")
    why_it_works: str = Field(default="", description="为什么适合漫画化")


class StoryIdeas(BaseModel):
    ideas: List[StoryIdea] = Field(description="3 个不同创作方向")

class ComicService:
    """Comic script generator using OpenAI or Google API"""
    
    def __init__(self, api_key: str = None, base_url: str = "https://api.openai.com/v1", model: str = "gpt-4o-mini", comic_style: str = "doraemon", language: str = "zh", google_api_key: str = None):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.comic_style = comic_style
        self.language = language
        self.google_api_key = google_api_key

    def _style_description(self) -> str:
        style_descriptions = {
            "doraemon": "哆啦A梦风格：圆润可爱的角色设计，简洁明快的线条，温馨幽默的氛围",
            "american": "美式漫画风格：夸张的肌肉线条，英雄主义，强烈的明暗对比",
            "watercolor": "水彩风格：柔和的色彩过渡，艺术感的笔触，梦幻氛围",
            "disney": "迪士尼动画艺术风格：流畅圆润的线条，夸张生动的表情，流畅的动作表现，温暖明亮的色彩，充满魔法和梦幻的氛围（注意：只借鉴艺术风格，不使用任何迪士尼角色名称）",
            "ghibli": "宫崎骏/吉卜力风格：细腻的自然场景描绘，柔和温暖的色调，充满想象力的奇幻元素，人物表情细腻生动，富有诗意和治愈感",
            "pixar": "皮克斯动画风格：3D渲染质感，圆润可爱的角色设计，丰富的光影效果，细腻的材质表现，情感表达真挚动人",
            "shonen": "日本少年漫画风格：充满动感的线条和速度线，夸张的表情和动作，热血激昂的氛围，强烈的视觉冲击力，快节奏的分镜",
            "tom_and_jerry": "猫和老鼠风格：经典的2D手绘动画风格，夸张的肢体动作和表情，充满活力的追逐和闹剧元素，鲜艳明快的色彩",
            "nezha": "哪吒风格：中国神话动画风格，融合传统国风与现代3D渲染技术，角色设计大胆夸张，浓烈的色彩对比，充满力量感的动作场面，烟熏妆朋克风的哪吒形象",
            "langlangshan": "浪浪山小妖怪风格：中国奇谭水墨动画风格，清新淡雅的水墨画质感，可爱呆萌的小妖怪形象，温馨治愈的氛围，富有中国传统美学韵味"
        }
        return style_descriptions.get(self.comic_style, style_descriptions["doraemon"])

    def _language_instruction(self, task: str = "generate") -> str:
        if task == "optimize":
            language_instructions = {
                "zh": "请用中文输出。",
                "en": "Please output in English.",
                "ja": "日本語で出力してください。"
            }
        else:
            language_instructions = {
                "zh": "请用中文生成所有内容（包括标题、分镜描述和对白）。",
                "en": "Please generate all content in English (including titles, panel descriptions, and dialogue).",
                "ja": "すべてのコンテンツ（タイトル、パネル説明、セリフを含む）を日本語で生成してください。"
            }
        return language_instructions.get(self.language, language_instructions["zh"])

    def _reference_directive_text(self, reference_character_directives: Optional[List[Dict[str, Any]]] = None) -> str:
        if not reference_character_directives:
            return "No alias mappings were detected in the user's prompt."

        lines = []
        for item in reference_character_directives:
            aliases = ", ".join(item.get("aliases", []))
            lines.append(
                "- User aliases [{aliases}] must map to internal character id `{safe_id}`, "
                "display name `{display_name}`, and reference_image `{reference_name}`. "
                "Use role hint: {role_hint}. Never output the alias strings in image-bound fields."
                .format(
                    aliases=aliases,
                    safe_id=item.get("safe_id", ""),
                    display_name=item.get("display_name", ""),
                    reference_name=item.get("reference_name", ""),
                    role_hint=item.get("role_hint", "")
                )
            )
        return "\n".join(lines)

    def _invoke_structured(self, system_prompt: str, user_prompt: str, schema: type[BaseModel], temperature: float = 0.7):
        if self.api_key:
            llm = ChatOpenAI(
                model=self.model,
                openai_api_key=self.api_key,
                base_url=self.base_url,
                temperature=temperature,
                max_tokens=6000
            )
            structured_llm = llm.with_structured_output(schema)
            return structured_llm.invoke(
                input=[
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_prompt)
                ],
            )

        client = genai.Client(api_key=self.google_api_key)
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[system_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=temperature,
                thinking_config=types.ThinkingConfig(thinking_level="low")
            )
        )
        parsed = response.parsed
        if parsed:
            return parsed

        text_response = response.text
        if "```json" in text_response:
            text_response = text_response.split("```json")[1].split("```")[0].strip()
        elif "```" in text_response:
            text_response = text_response.split("```")[1].split("```")[0].strip()
        return schema(**json.loads(text_response))

    def _compose_panel_text(self, panel: Dict[str, Any]) -> str:
        if panel.get("text"):
            return panel["text"]

        parts = []
        if panel.get("shot"):
            parts.append(f"镜头: {panel['shot']}")
        if panel.get("location_id"):
            parts.append(f"场景: {panel['location_id']}")
        if panel.get("characters"):
            parts.append("角色: " + ", ".join(panel["characters"]))
        if panel.get("action"):
            parts.append(panel["action"])
        if panel.get("emotion"):
            parts.append(f"情绪: {panel['emotion']}")
        if panel.get("visual_notes"):
            parts.append(panel["visual_notes"])

        dialogue = panel.get("dialogue") or []
        for line in dialogue:
            if isinstance(line, dict) and line.get("text"):
                speaker = line.get("speaker") or ""
                parts.append(f"{speaker}: \"{line['text']}\"" if speaker else f"\"{line['text']}\"")

        return "；".join(parts)

    def _normalize_package(
        self,
        comic_script: ComicScript,
        reference_character_directives: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        data = comic_script.model_dump()
        self._normalize_story_bible(data.get("story_bible", {}))
        self._apply_reference_directives(data, reference_character_directives)
        for page in data.get("pages", []):
            for row in page.get("rows", []):
                for panel in row.get("panels", []):
                    panel["text"] = self._compose_panel_text(panel)
        deterministic_notes = self._deterministic_review(data.get("pages", []), data.get("story_bible", {}))
        data["review_notes"] = (data.get("review_notes") or []) + deterministic_notes
        if deterministic_notes:
            data["pages"] = self.clean_script(data.get("pages", []))
        return data

    def _normalize_story_bible(self, story_bible: Dict[str, Any]) -> None:
        """Keep referenced characters from accumulating invented wardrobe details."""
        if not isinstance(story_bible, dict):
            return
        for character in story_bible.get("characters", []) or []:
            if not isinstance(character, dict):
                continue
            if character.get("reference_image"):
                character["appearance_rule"] = "Use the named reference image as the only visual source. Do not infer extra wardrobe, face, hair, or body-design details in panel scripts."
                forbidden = character.get("forbidden_changes") or []
                if "Do not add visual details beyond the reference image." not in forbidden:
                    forbidden.append("Do not add visual details beyond the reference image.")
                character["forbidden_changes"] = forbidden

    def _apply_reference_directives(
        self,
        data: Dict[str, Any],
        reference_character_directives: Optional[List[Dict[str, Any]]] = None
    ) -> None:
        """Enforce alias-to-reference mappings before prompts reach image generation."""
        if not reference_character_directives:
            return

        story_bible = data.setdefault("story_bible", {})
        if not isinstance(story_bible, dict):
            return

        characters = story_bible.setdefault("characters", [])
        if not isinstance(characters, list):
            story_bible["characters"] = []
            characters = story_bible["characters"]

        id_rewrites = {}
        alias_rewrites = {}

        for item in reference_character_directives:
            aliases = [alias for alias in item.get("aliases", []) if isinstance(alias, str)]
            safe_id = item.get("safe_id") or item.get("reference_name")
            display_name = item.get("display_name") or item.get("reference_name") or safe_id
            reference_name = item.get("reference_name") or display_name
            if not safe_id or not reference_name:
                continue

            match = None
            for character in characters:
                if not isinstance(character, dict):
                    continue
                current_reference = str(character.get("reference_image") or character.get("name") or "")
                current_reference = current_reference.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                names_to_match = {character.get("id"), character.get("name"), current_reference}
                if safe_id in names_to_match or display_name in names_to_match or reference_name in names_to_match or any(alias in names_to_match for alias in aliases):
                    match = character
                    break

            if match is None:
                match = {
                    "id": safe_id,
                    "name": display_name,
                    "role": item.get("role_hint", ""),
                    "personality": item.get("role_hint", ""),
                    "forbidden_changes": []
                }
                characters.append(match)

            original_ids = [match.get("id"), match.get("name"), *aliases]
            for old_id in original_ids:
                if old_id:
                    id_rewrites[str(old_id)] = safe_id
                    alias_rewrites[str(old_id)] = display_name
            for reference_alias in [reference_name, display_name, safe_id]:
                if reference_alias:
                    id_rewrites[str(reference_alias)] = safe_id

            match["id"] = safe_id
            match["name"] = display_name
            match["reference_image"] = reference_name
            if item.get("role_hint") and not match.get("role"):
                match["role"] = item["role_hint"]
            match["appearance_rule"] = "Use the named reference image as the only visual source. Do not infer extra wardrobe, face, hair, or body-design details in panel scripts."
            forbidden = match.get("forbidden_changes") or []
            for rule in [
                "Do not add visual details beyond the reference image.",
                "Do not use user-facing alias names in image prompts."
            ]:
                if rule not in forbidden:
                    forbidden.append(rule)
            match["forbidden_changes"] = forbidden

        if not id_rewrites:
            return

        forbidden_details = story_bible.get("forbidden_details") or []
        rule = "User-facing protected or brand-adjacent aliases are input shorthand only; image-bound prompts must use internal safe character names and reference images."
        if rule not in forbidden_details:
            forbidden_details.append(rule)
        story_bible["forbidden_details"] = forbidden_details

        def sanitize_text(value: str) -> str:
            for alias, replacement in sorted(alias_rewrites.items(), key=lambda pair: len(pair[0]), reverse=True):
                if alias == replacement:
                    continue
                value = value.replace(alias, replacement)
            return value

        for page in data.get("pages", []) or []:
            if isinstance(page.get("title"), str):
                page["title"] = sanitize_text(page["title"])
            for row in page.get("rows", []) or []:
                for panel in row.get("panels", []) or []:
                    if not isinstance(panel, dict):
                        continue
                    panel["characters"] = [id_rewrites.get(str(character_id), str(character_id)) for character_id in panel.get("characters", []) or []]
                    for key in ["text", "action", "emotion", "visual_notes", "negative_notes"]:
                        if isinstance(panel.get(key), str):
                            panel[key] = sanitize_text(panel[key])
                    for line in panel.get("dialogue", []) or []:
                        if isinstance(line, dict):
                            if isinstance(line.get("speaker"), str):
                                line["speaker"] = id_rewrites.get(line["speaker"], sanitize_text(line["speaker"]))
                            if isinstance(line.get("text"), str):
                                line["text"] = sanitize_text(line["text"])

    def _extract_final_reveal_terms(self, prompt: str) -> List[str]:
        """Extract simple final-reveal terms that should not appear early."""
        if not prompt:
            return []
        terms = []
        final_fragments = re.findall(r"(?:最后|最终|结尾|真相|揭示|才揭示)[^。！？.!?]*", prompt)
        for fragment in final_fragments:
            container_match = re.search(r"(?:放进|放到|放在|藏在|装进|在)([^，。！？,.!?]{1,12})(?:里|中|内)?", fragment)
            if container_match:
                term = container_match.group(1).strip()
                term = re.sub(r"^(自己|他的|她的|它的|小兔|小狐狸|猪妖|黄鼠狼)", "", term).strip()
                term = re.sub(r"(里|中|内)$", "", term).strip()
                if len(term) >= 2:
                    terms.append(term)

            action_match = re.search(r"(?:原来|发现)([^，。！？,.!?]{2,16})", fragment)
            if action_match:
                phrase = action_match.group(1).strip()
                for token in re.split(r"[，,、\\s]+", phrase):
                    token = token.strip("的了是在被给")
                    if 2 <= len(token) <= 8 and token not in ["最后", "发现", "原来", "自己", "昨晚"]:
                        terms.append(token)

        deduped = []
        for term in terms:
            if term and term not in deduped:
                deduped.append(term)
        return deduped[:4]

    def _early_reveal_terms(self, pages: List[Dict[str, Any]], reveal_terms: List[str]) -> List[str]:
        if len(pages) <= 1 or not reveal_terms:
            return []
        visible_fields = []
        for page in pages[:-1]:
            for row in page.get("rows", []) or []:
                for panel in row.get("panels", []) or []:
                    for key in ["text", "action", "visual_notes"]:
                        visible_fields.append(str(panel.get(key, "")))
        early_text = "\n".join(visible_fields)
        return [term for term in reveal_terms if term and term in early_text]

    def _mask_early_reveal_terms(self, pages: List[Dict[str, Any]], reveal_terms: List[str]) -> None:
        """Remove explicit final-answer terms from pre-final page prompts."""
        if len(pages) <= 1 or not reveal_terms:
            return
        for page in pages[:-1]:
            for row in page.get("rows", []) or []:
                for panel in row.get("panels", []) or []:
                    for key in ["text", "action", "visual_notes"]:
                        value = panel.get(key)
                        if isinstance(value, str):
                            for term in reveal_terms:
                                value = value.replace(term, "关键线索")
                            panel[key] = value
                    negative = panel.get("negative_notes")
                    if isinstance(negative, str):
                        for term in reveal_terms:
                            negative = negative.replace(term, "最终揭示物")
                        panel["negative_notes"] = negative
                    if any(panel.get(key) for key in ["shot", "location_id", "characters", "action", "emotion", "visual_notes"]) or panel.get("dialogue"):
                        panel["text"] = ""
                        panel["text"] = self._compose_panel_text(panel)

    def _deterministic_review(self, pages: List[Dict[str, Any]], story_bible: Dict[str, Any] | StoryBible | None = None) -> List[Dict[str, str]]:
        if isinstance(story_bible, StoryBible):
            story_bible = story_bible.model_dump()
        story_bible = story_bible or {}
        known_characters = {c.get("id") for c in story_bible.get("characters", []) if isinstance(c, dict)}
        issues = []
        clothing_words = ["穿着", "身穿", "衣服", "外套", "裙子", "帽子", "鞋子", "costume", "outfit", "wearing", "clothes"]

        for page_idx, page in enumerate(pages, 1):
            for row_idx, row in enumerate(page.get("rows", []), 1):
                for panel_idx, panel in enumerate(row.get("panels", []), 1):
                    location = f"P{page_idx} R{row_idx} C{panel_idx}"
                    text = panel.get("text", "")
                    dialogue = panel.get("dialogue") or []
                    for line in dialogue:
                        content = line.get("text", "") if isinstance(line, dict) else ""
                        if len(content) > 18:
                            issues.append({
                                "severity": "warning",
                                "location": location,
                                "message": "对白偏长，可能不适合漫画气泡。",
                                "suggestion": "压缩到 12 个中文字符或 8 个英文词左右。"
                            })
                    if any(word in text for word in clothing_words):
                        issues.append({
                            "severity": "warning",
                            "location": location,
                            "message": "分镜文本疑似写入服装/外貌细节。",
                            "suggestion": "角色外貌和服装应由角色参考图或故事圣经控制，分镜只写动作、镜头和情绪。"
                        })
                    for character_id in panel.get("characters", []) or []:
                        if known_characters and character_id not in known_characters:
                            issues.append({
                                "severity": "warning",
                                "location": location,
                                "message": f"角色 `{character_id}` 未出现在故事圣经中。",
                                "suggestion": "添加到角色表，或改成已有角色 ID。"
                            })
        return issues

    def _strip_production_details(self, text: str) -> str:
        if not text:
            return text

        clothing_patterns = [
            r"穿着[^。；;,.，]*?(衣服|外套|裙子|帽子|鞋子|服装)",
            r"身穿[^。；;,.，]*?(衣服|外套|裙子|帽子|鞋子|服装)",
            r"[^。；;,.，]*?(衣服|外套|裙子|帽子|鞋子|服装)[^。；;,.，]*",
            r"wearing [^.;,]*(outfit|costume|clothes|jacket|dress|hat|shoes)",
            r"[^.;,]*(outfit|costume) details?[^.;,]*",
        ]
        cleaned = text
        for pattern in clothing_patterns:
            cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
        return cleaned.strip(" ；;，,。.")

    def clean_script(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove production-hostile details from panel-level copy."""
        cleaned_pages = json.loads(json.dumps(pages, ensure_ascii=False))
        for page in cleaned_pages:
            for row in page.get("rows", []):
                for panel in row.get("panels", []):
                    for key in ["text", "action", "visual_notes"]:
                        if key in panel and isinstance(panel[key], str):
                            panel[key] = self._strip_production_details(panel[key])
                    existing_negative = panel.get("negative_notes", "")
                    lock_note = "Do not change character appearance or clothing; use reference image/story bible."
                    if lock_note not in existing_negative:
                        panel["negative_notes"] = (existing_negative + " " + lock_note).strip()
                    if any(panel.get(key) for key in ["shot", "location_id", "characters", "action", "emotion", "visual_notes"]) or panel.get("dialogue"):
                        panel["text"] = ""
                        panel["text"] = self._compose_panel_text(panel)
        return cleaned_pages
    
    def generate_story_ideas(
        self,
        prompt: str,
        reference_character_names: Optional[List[str]] = None,
        reference_character_directives: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """Generate three selectable story directions before making panels."""
        reference_character_names = reference_character_names or []
        system_prompt = f"""You are a senior comic story editor. Create 3 distinct comic story directions from the user's rough idea.

Style context: {self._style_description()}
Language requirement: {self._language_instruction("optimize")}

Use the available reference characters when they fit: {", ".join(reference_character_names) or "none"}.
Alias-to-reference mappings:
{self._reference_directive_text(reference_character_directives)}

Do not invent copyrighted character names. Keep each direction compact and actionable for storyboard generation."""

        try:
            ideas = self._invoke_structured(system_prompt, prompt, StoryIdeas, temperature=0.85)
            return [idea.model_dump() for idea in ideas.ideas]
        except Exception as e:
            raise Exception(f"Story idea generation failed: {str(e)}")

    def generate_comic_package(
        self,
        prompt: str,
        page_count: int = 3,
        rows_per_page: int = 4,
        reference_character_names: Optional[List[str]] = None,
        reference_character_directives: Optional[List[Dict[str, Any]]] = None,
        existing_story_bible: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate comic package: story bible, structured pages, review notes,
        and continuity summaries.

        Args:
            prompt: User's description of the comic
            page_count: Number of pages to generate
            rows_per_page: Number of rows per page (3-5)

        Returns:
            Dict with pages, story_bible, continuity_summaries, and review_notes
        """
        reference_character_names = reference_character_names or []
        reference_character_directives = reference_character_directives or []
        existing_bible_json = json.dumps(existing_story_bible or {}, ensure_ascii=False)
        
        system_prompt = f"""You are a professional comic storyboard script assistant. Please generate a {page_count}-page comic storyboard script based on the user's description.

**IMPORTANT: Please use {self._style_description()} to design the storyboard content.**

**Language Requirement: {self._language_instruction()}**

**Available Character Reference Images**:
{", ".join(reference_character_names) if reference_character_names else "No named reference images found."}

**Alias-to-Reference Character Mappings (Critical)**:
{self._reference_directive_text(reference_character_directives)}

**Existing Story Bible (reuse and improve if provided)**:
{existing_bible_json}

Please strictly follow the provided Schema structure to generate the storyboard script:

1. **Story Structure & Layout**:
   - Generate a complete and coherent {page_count}-page story.
   - Respect user-specified reveal timing. If the user describes a final discovery, twist, or ending, do NOT reveal it before the final page.
   - For multi-page stories, use clear page pacing: page 1 setup and mystery, middle pages investigation/escalation, final page reveal/resolution.
   - Early pages may show subtle clues, but they must not visually disclose the final answer.
   - **Page Layout**: Each comic page is laid out VERTICALLY with multiple ROWS stacked from top to bottom.
   - **Row Count**: Each page MUST contain EXACTLY {rows_per_page} rows (vertical sections). Do not add more or fewer rows.
   - **Panel Layout**: Each row contains 1-2 panels arranged HORIZONTALLY within that row.
   - **Pacing Control**: Mix single-panel rows (for emphasis/key moments) with two-panel rows (for dialogue/action sequences) to create dynamic pacing.

2. **Story Bible (Critical)**:
   - Create a `story_bible` first: stable character IDs, stable location IDs, props, visual rules, and forbidden details.
   - If a character reference image name matches a character, put the file/name in `reference_image`.
   - If alias-to-reference mappings are provided, use the mapped internal character id, display name, and `reference_image` exactly.
   - User-facing aliases in the mapping are shorthand only. Do NOT put those alias strings in `story_bible`, `characters`, panel text, action, visual notes, dialogue speaker names, or any image-bound field.
   - If `reference_image` is set, `appearance_rule` MUST say to use the reference image only. Do NOT invent wardrobe, face, hair, or body-design details.
   - For characters without reference images, character appearance belongs in `story_bible.characters[*].appearance_rule`, not in panel scripts.
   - Location layout, lighting, fixed props, and scene consistency MUST live in `story_bible.locations`.
   - Use `forbidden_details` for global constraints such as no costume changes, no unregistered characters, and no sudden location changes.

3. **Panel Schema (Critical)**:
   - Each panel MUST use structured fields: `shot`, `location_id`, `characters`, `action`, `emotion`, `dialogue`, `visual_notes`, and `negative_notes`.
   - `text` is only a readable summary copied from the structured fields for legacy UI compatibility.
   - `characters` must contain IDs from story_bible.characters.
   - `location_id` must come from story_bible.locations.
   - Do NOT describe character clothing, hair, face, or body design inside `text`, `action`, or `visual_notes` when a reference image or character asset exists.

4. **Visual Design**:
   - **Row Height**: Dynamically adjust `height` based on the importance of the panels.
     - Standard shots/dialogue: Use '250px'.
     - Key actions/emphasis shots: Use '350px' or '400px'.
     - Avoid using the same height for all rows.
   - **Panel Description**: The structured fields MUST contain specific visual descriptions (camera angle, facial expressions, body language, background state).
   - Descriptions should fully reflect the visual style of {self.comic_style}.

5. **Dialogue Content (Very Important)**:
   - **Concise Speech Bubbles**: This is a comic, so every line of dialogue must be short and easy to fit inside a speech bubble.
   - **Length Limit**: Each quoted dialogue line should be no more than 12 Chinese characters, 8 English words, or 16 Japanese kana/kanji characters whenever possible.
   - **Few Lines**: Use at most 1-2 short dialogue lines per panel. Avoid long explanations, narration, and repeated information.
   - Put dialogue in the `dialogue` array. Also mirror short dialogue in `text` for legacy display.
   - **Balance**: Let visuals carry the story. Use dialogue only for punchlines, reactions, decisions, or key emotional beats. Internal monologue should be minimal.
   - **Readable Comics**: Readers should understand the scene from clear visuals plus brief speech bubbles, not from dense text.

6. **Continuity Summaries**:
   - Return one `continuity_summaries` entry for every page.
   - Summaries must say what the next page should preserve: location state, character positions/emotions, and key props.

7. **Automatic Review**:
   - Fill `review_notes` with warnings for long dialogue, panel text that includes clothing/appearance, unregistered characters, or abrupt scene changes.
   - If everything is clean, return an empty list.

8. **Language**:
   - All content (titles, descriptions, dialogue) must follow the language requirement: {self._language_instruction()}

9. **Character Naming (CRITICAL)**:
   - **ONLY use the character names/descriptions provided by the user.** If the user says "rabbit", use "rabbit" or "小兔子" - do NOT replace it with copyrighted character names.
   - **DO NOT use any copyrighted or trademarked character names** (e.g., Mickey Mouse, Judy Hopps, Elsa, Totoro, etc.).
   - The style setting only affects the visual appearance and art style, NOT the characters themselves.
   - Create original character names if needed, but never use existing IP character names."""

        try:
            comic_script_data: ComicScript = self._invoke_structured(system_prompt, prompt, ComicScript, temperature=0.7)
            package = self._normalize_package(comic_script_data, reference_character_directives)
            reveal_terms = self._extract_final_reveal_terms(prompt)
            leaked_terms = self._early_reveal_terms(package.get("pages", []), reveal_terms)
            if leaked_terms and page_count > 1:
                revision_prompt = (
                    prompt
                    + "\n\nREVISION REQUIRED: The previous draft revealed final-answer terms too early: "
                    + ", ".join(leaked_terms)
                    + ". Rewrite the storyboard so these terms, objects, containers, or visual clues do not appear before the final page. "
                    + "Use indirect mystery clues in earlier pages instead, and reveal the answer only on the final page."
                )
                comic_script_data = self._invoke_structured(system_prompt, revision_prompt, ComicScript, temperature=0.65)
                package = self._normalize_package(comic_script_data, reference_character_directives)
                leaked_terms = self._early_reveal_terms(package.get("pages", []), reveal_terms)
                if leaked_terms:
                    self._mask_early_reveal_terms(package.get("pages", []), leaked_terms)
                    leaked_terms = self._early_reveal_terms(package.get("pages", []), reveal_terms)
                if leaked_terms:
                    package.setdefault("review_notes", []).append({
                        "severity": "warning",
                        "location": "story pacing",
                        "message": "Final reveal terms appear before the final page: " + ", ".join(leaked_terms),
                        "suggestion": "Move these visual clues to the final page or make early clues less explicit."
                    })
            return package
            
        except Exception as e:
            raise Exception(f"AI generation failed: {str(e)}")

    def generate_comic_script(self, prompt: str, page_count: int = 3, rows_per_page: int = 4) -> List[Dict[str, Any]]:
        """Legacy API: return only pages."""
        package = self.generate_comic_package(prompt, page_count, rows_per_page)
        return package["pages"]

    def review_script(self, pages: List[Dict[str, Any]], story_bible: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run a deterministic script review and cleanup fast enough for inline editing."""
        notes = self._deterministic_review(pages, story_bible)
        cleaned_pages = self.clean_script(pages)
        return {
            "review_notes": notes,
            "cleaned_pages": cleaned_pages
        }

    def rewrite_panel(
        self,
        panel: Dict[str, Any],
        story_bible: Dict[str, Any],
        before_panel: Optional[Dict[str, Any]] = None,
        after_panel: Optional[Dict[str, Any]] = None,
        instruction: str = "make it clearer",
    ) -> Dict[str, Any]:
        """Rewrite one panel while preserving bible constraints and context."""
        class PanelRewrite(BaseModel):
            panel: Panel
            review_notes: List[ScriptReviewIssue] = Field(default_factory=list)

        payload = {
            "panel": panel,
            "before_panel": before_panel,
            "after_panel": after_panel,
            "story_bible": story_bible,
            "instruction": instruction,
        }
        system_prompt = f"""You rewrite exactly one comic panel.

Language requirement: {self._language_instruction()}
Style context: {self._style_description()}

Rules:
- Preserve character IDs and location IDs unless the instruction explicitly says otherwise.
- Do not put clothing, hair, face, or body design in panel text/action/visual_notes when the story bible or reference images define the character.
- Keep dialogue short.
- Return only the rewritten panel and review notes."""

        try:
            result: PanelRewrite = self._invoke_structured(system_prompt, json.dumps(payload, ensure_ascii=False), PanelRewrite, temperature=0.55)
            panel_data = result.panel.model_dump()
            panel_data["text"] = self._compose_panel_text(panel_data)
            return {
                "panel": panel_data,
                "review_notes": [note.model_dump() for note in result.review_notes]
            }
        except Exception as e:
            raise Exception(f"Panel rewrite failed: {str(e)}")


def validate_script(script) -> tuple[bool, str]:
    """
    Validate comic script format
    
    Args:
        script: Comic script object or array
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not script:
        return False, "No script provided"
    
    def _validate_page(page: Dict) -> bool:
        """Validate a single page structure"""
        if not isinstance(page, dict):
            return False
        
        if 'rows' not in page or not isinstance(page['rows'], list):
            return False
        
        for row in page['rows']:
            if not isinstance(row, dict):
                return False
            if 'panels' not in row or not isinstance(row['panels'], list):
                return False
            for panel in row['panels']:
                if not isinstance(panel, dict):
                    return False
        
        return True
    
    # Validate structure
    if isinstance(script, list):
        for page in script:
            if not _validate_page(page):
                return False, "Invalid page structure"
    else:
        if not _validate_page(script):
            return False, "Invalid page structure"
    
    return True, ""
