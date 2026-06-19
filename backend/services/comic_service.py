"""Comic script generation service"""
import openai
import json
from typing import List, Dict, Any, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from comic_generator import generate_codex_text_core


class Panel(BaseModel):
    text: str = Field(description="分镜描述文字；若包含对白，对白必须短小精炼，适合漫画气泡")


class Row(BaseModel):
    height: str = Field(description="行高度，例如 '180px'")
    panels: List[Panel]

class ComicPage(BaseModel):
    title: str = Field(description="页标题")
    rows: List[Row]

class ComicScript(BaseModel):
    pages: List[ComicPage] = Field(description="漫画面板页面列表")

class ComicService:
    """Comic script generator using Codex OAuth, OpenAI, or Google API"""
    
    def __init__(self, api_key: str = None, base_url: str = "https://api.openai.com/v1", model: str = "gpt-4o-mini", comic_style: str = "doraemon", language: str = "zh", google_api_key: str = None, text_provider: str = "openai", reasoning_effort: str = "medium"):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.comic_style = comic_style
        self.language = language
        self.google_api_key = google_api_key
        self.text_provider = text_provider
        self.reasoning_effort = reasoning_effort

    def _reference_directive_text(self, reference_character_directives: Optional[List[Dict[str, Any]]] = None) -> str:
        if not reference_character_directives:
            return "No alias mappings were detected in the user's prompt."

        lines = []
        for item in reference_character_directives:
            aliases = ", ".join(item.get("aliases", []))
            lines.append(
                "- User aliases [{aliases}] must be written as `{display_name}` and use local reference image `{reference_name}`. "
                "Role hint: {role_hint}. Do not output the alias strings in panel text."
                .format(
                    aliases=aliases,
                    display_name=item.get("display_name", ""),
                    reference_name=item.get("reference_name", ""),
                    role_hint=item.get("role_hint", "")
                )
            )
        return "\n".join(lines)

    def _prompt_with_reference_directives(
        self,
        prompt: str,
        reference_character_directives: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        if not reference_character_directives:
            return prompt

        return (
            prompt
            + "\n\nReference character alias mapping for this request:\n"
            + self._reference_directive_text(reference_character_directives)
        )

    def _normalize_generated_pages(self, pages: List[Dict[str, Any]], rows_per_page: int) -> List[Dict[str, Any]]:
        for page in pages:
            rows = page.get("rows") or []

            if rows_per_page != 1:
                if len(rows) > rows_per_page:
                    kept_rows = rows[:rows_per_page]
                    overflow_texts = []
                    for row in rows[rows_per_page:]:
                        for panel in row.get("panels", []) or []:
                            text = panel.get("text")
                            if isinstance(text, str) and text.strip():
                                overflow_texts.append(text.strip())
                    if overflow_texts and kept_rows:
                        last_panels = kept_rows[-1].setdefault("panels", [])
                        if not last_panels:
                            last_panels.append({"text": "；".join(overflow_texts)})
                        else:
                            existing_text = last_panels[-1].get("text", "")
                            last_panels[-1]["text"] = "；".join(
                                text for text in [existing_text, *overflow_texts]
                                if isinstance(text, str) and text.strip()
                            )
                    page["rows"] = kept_rows
                elif rows and len(rows) < rows_per_page:
                    last_row = rows[-1]
                    while len(rows) < rows_per_page:
                        rows.append({
                            "height": last_row.get("height", "250px"),
                            "panels": last_row.get("panels", []) or [{"text": ""}]
                        })
                    page["rows"] = rows
                continue

            merged_texts = []
            for row in rows:
                for panel in row.get("panels", []) or []:
                    text = panel.get("text")
                    if isinstance(text, str) and text.strip():
                        merged_texts.append(text.strip())

            if not merged_texts:
                continue

            page["rows"] = [{
                "height": rows[0].get("height", "400px") if rows else "400px",
                "panels": [{
                    "text": "；".join(merged_texts)
                }]
            }]

        return pages
    
    def generate_comic_script(
        self,
        prompt: str,
        page_count: int = 3,
        rows_per_page: int = 4,
        reference_character_names: Optional[List[str]] = None,
        reference_character_directives: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate comic script based on user prompt

        Args:
            prompt: User's description of the comic
            page_count: Number of pages to generate
            rows_per_page: Number of rows per page (1-5)

        Returns:
            List of comic page data
        """
        # Define style descriptions
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
        
        # Define language instructions
        language_instructions = {
            "zh": "请用中文生成所有内容（包括标题和分镜描述）。",
            "en": "Please generate all content in English (including titles and panel descriptions).",
            "ja": "すべてのコンテンツ（タイトルとパネルの説明を含む）を日本語で生成してください。"
        }
        
        reference_character_names = reference_character_names or []
        reference_character_directives = reference_character_directives or []
        style_desc = style_descriptions.get(self.comic_style, style_descriptions["doraemon"])
        language_instruction = language_instructions.get(self.language, language_instructions["zh"])
        prompt_for_model = self._prompt_with_reference_directives(prompt, reference_character_directives)
        panel_layout_instruction = (
            "Each page contains exactly ONE row and that row MUST contain exactly ONE full-width panel. "
            "Do NOT create two side-by-side panels or columns when rows_per_page is 1."
            if rows_per_page == 1
            else "Each row contains 1-2 panels arranged HORIZONTALLY within that row."
        )
        pacing_instruction = (
            "Use the single full-width panel as a strong poster-like story moment."
            if rows_per_page == 1
            else "Mix single-panel rows (for emphasis/key moments) with two-panel rows (for dialogue/action sequences) to create dynamic pacing."
        )
        
        system_prompt = f"""You are a professional comic storyboard script assistant. Please generate a {page_count}-page comic storyboard script based on the user's description.

**IMPORTANT: Please use {style_desc} to design the storyboard content.**

**Language Requirement: {language_instruction}**

Please strictly follow the provided Schema structure to generate the storyboard script:

1. **Story Structure & Layout**:
   - Generate a complete and coherent {page_count}-page story.
   - **Page Layout**: Each comic page is laid out VERTICALLY with multiple ROWS stacked from top to bottom.
   - **Row Count**: Each page MUST contain EXACTLY {rows_per_page} rows (vertical sections). Do not add more or fewer rows.
   - **Panel Layout**: {panel_layout_instruction}
   - **Pacing Control**: {pacing_instruction}

2. **Visual Design (Critical)**:
   - **Row Height**: Dynamically adjust `height` based on the importance of the panels.
     - Standard shots/dialogue: Use '250px'.
     - Key actions/emphasis shots: Use '350px' or '400px'.
     - Avoid using the same height for all rows.
   - **Panel Description**: The `text` field MUST contain specific visual descriptions (e.g., camera angle, facial expressions, body language, background details).
   - Descriptions should fully reflect the visual style of {self.comic_style}.

3. **Dialogue Content (Very Important)**:
   - **Concise Speech Bubbles**: This is a comic, so every line of dialogue must be short and easy to fit inside a speech bubble.
   - **Length Limit**: Each quoted dialogue line should be no more than 12 Chinese characters, 8 English words, or 16 Japanese kana/kanji characters whenever possible.
   - **Few Lines**: Use at most 1-2 short dialogue lines per panel. Avoid long explanations, narration, and repeated information.
   - **Speech Bubbles**: In the `text` field, use quotes to indicate character dialogue (e.g., "Character A: 'Go!'"). This text will appear as speech bubbles in the comic.
   - **Balance**: Let visuals carry the story. Use dialogue only for punchlines, reactions, decisions, or key emotional beats. Internal monologue should be minimal.
   - **Readable Comics**: Readers should understand the scene from clear visuals plus brief speech bubbles, not from dense text.

4. **Language**:
   - All content (titles, descriptions, dialogue) must follow the language requirement: {language_instruction}

5. **Character Naming (CRITICAL)**:
   - **ONLY use the character names/descriptions provided by the user.** If the user says "rabbit", use "rabbit" or "小兔子" - do NOT replace it with copyrighted character names.
   - **DO NOT use any copyrighted or trademarked character names** (e.g., Mickey Mouse, Judy Hopps, Elsa, Totoro, etc.).
   - The style setting only affects the visual appearance and art style, NOT the characters themselves.
   - Create original character names if needed, but never use existing IP character names.

6. **Local Reference Characters**:
   - Available local reference image names for this style: {", ".join(reference_character_names) or "none"}.
   - If alias mappings are provided below, treat the aliases as input shorthand only.
   - Use the mapped display name in titles, panel descriptions, and dialogue instead of the alias.
   - Make the mapped display name appear naturally in relevant panel descriptions so image generation can select the correct local reference image.

Alias-to-reference mappings:
{self._reference_directive_text(reference_character_directives)}"""

        try:
            if self.text_provider == "codex":
                codex_system_prompt = system_prompt + """

Return ONLY valid JSON with this exact top-level shape:
{"pages":[{"title":"...","rows":[{"height":"250px","panels":[{"text":"..."}]}]}]}
Do not wrap the JSON in markdown fences or add explanatory text."""
                text_response = generate_codex_text_core(
                    system_prompt=codex_system_prompt,
                    user_prompt=prompt_for_model,
                    model=self.model,
                    reasoning_effort=self.reasoning_effort,
                    json_mode=True
                )
                if "```json" in text_response:
                    text_response = text_response.split("```json")[1].split("```")[0].strip()
                elif "```" in text_response:
                    text_response = text_response.split("```")[1].split("```")[0].strip()

                data = json.loads(text_response)
                comic_script_data = ComicScript(**data)
                comic_data = [elem.model_dump() for elem in comic_script_data.pages]
                return self._normalize_generated_pages(comic_data, rows_per_page)
            elif self.api_key:
                llm = ChatOpenAI(model=self.model, openai_api_key=self.api_key, base_url=self.base_url, temperature=0.7, max_tokens=3000)
                structured_llm = llm.with_structured_output(ComicScript)
                response: ComicScript = structured_llm.invoke(
                    input=[
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=prompt_for_model)
                    ],
                )
                
                # Parse and validate JSON
                comic_data = [elem.model_dump() for elem in response.pages]
                return self._normalize_generated_pages(comic_data, rows_per_page)
            else:
                # Fallback to Google Gemini
                client = genai.Client(api_key=self.google_api_key)
                response = client.models.generate_content(
                    model="gemini-3-flash-preview",
                    contents=[system_prompt, prompt_for_model],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=ComicScript,
                        thinking_config=types.ThinkingConfig(thinking_level="low")
                    )
                )
                
                # Parse Google response
                comic_script_data = response.parsed
                if not comic_script_data:
                    # Retry with raw JSON parsing if needed
                    text_response = response.text
                    # Extract JSON from potential markdown
                    if "```json" in text_response:
                        text_response = text_response.split("```json")[1].split("```")[0].strip()
                    elif "```" in text_response:
                        text_response = text_response.split("```")[1].split("```")[0].strip()
                    
                    data = json.loads(text_response)
                    comic_script_data = ComicScript(**data)
                
                comic_data = [elem.model_dump() for elem in comic_script_data.pages]
                return self._normalize_generated_pages(comic_data, rows_per_page)
            
        except Exception as e:
            raise Exception(f"AI generation failed: {str(e)}")


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
