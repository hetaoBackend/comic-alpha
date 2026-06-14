"""Session title generation service"""
import logging
from typing import Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from google import genai
from google.genai import types
from comic_generator import generate_codex_text_core

logger = logging.getLogger(__name__)


class SessionTitleService:
    """Generate concise, descriptive titles for comic sessions using OpenAI or Google API"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-4o-mini",
        language: str = "zh",
        google_api_key: Optional[str] = None,
        text_provider: str = "openai",
        reasoning_effort: str = "medium"
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.language = language
        self.google_api_key = google_api_key
        self.text_provider = text_provider
        self.reasoning_effort = reasoning_effort

    def generate_title(self, prompt: str, comic_data: Optional[dict] = None) -> str:
        """
        Generate a concise, descriptive title for a comic session

        Args:
            prompt: User's original prompt for the comic
            comic_data: Optional comic data (first page, overall structure)

        Returns:
            A short, descriptive title (5-15 characters recommended)
        """
        # Define language instructions
        language_instructions = {
            "zh": "请用中文生成标题。标题应该简洁（5-15个汉字），有吸引力，能概括故事的核心主题或亮点。",
            "en": "Generate the title in English. The title should be concise (3-8 words), catchy, and capture the core theme or highlight of the story.",
            "ja": "日本語でタイトルを生成してください。タイトルは簡潔（5-15文字）で、魅力的で、ストーリーの核心テーマまたはハイライトを捉えたものにしてください。"
        }

        language_instruction = language_instructions.get(self.language, language_instructions["zh"])

        # Build context from comic data if available
        context_info = ""
        if comic_data and isinstance(comic_data, dict):
            if "pages" in comic_data and len(comic_data["pages"]) > 0:
                # Extract key information from the first page
                first_page = comic_data["pages"][0]
                if "title" in first_page:
                    context_info += f"\n\n生成的第一页标题: {first_page['title']}"

                # Extract main character or theme from first panel if available
                if "rows" in first_page and len(first_page["rows"]) > 0:
                    first_row = first_page["rows"][0]
                    if "panels" in first_row and len(first_row["panels"]) > 0:
                        first_panel_text = first_row["panels"][0].get("text", "")
                        if first_panel_text and len(first_panel_text) > 0:
                            # Truncate if too long
                            preview = first_panel_text[:100] + "..." if len(first_panel_text) > 100 else first_panel_text
                            context_info += f"\n第一个分镜内容: {preview}"

        system_prompt = f"""你是一个专业的漫画标题生成器。你的任务是为漫画创作会话生成一个简短、准确、吸引人的标题。

**语言要求**: {language_instruction}

**核心原则**（按优先级排序）：
1. **准确性第一**：标题必须准确反映故事的核心主题，不要过度发挥创意而偏离主题
2. **简洁明了**：控制在推荐长度内，去除冗余修饰
3. **抓住重点**：聚焦故事的主角、关键情节或核心冲突
4. **便于识别**：让用户一眼就能认出这个故事

**标题生成步骤**：
1. 仔细阅读用户的故事描述和漫画内容
2. 识别核心要素：主角是谁？主要做什么？核心冲突或主题是什么？
3. 提炼最关键的1-2个要素
4. 用最简洁的语言表达出来

**优秀示例**：
- 用户描述: "讲述小明从零开始学习Python编程，遇到困难但最终做出了第一个网站的故事"
  → 标题: "小明学编程" （抓住主角+核心行为）

- 用户描述: "一只流浪猫在城市里寻找家的温暖，最终被一个小女孩收养"
  → 标题: "流浪猫找家记" （抓住主角+核心情节）

- 用户描述: "魔法学院的学生露西发现了一个古老的咒语，她必须阻止黑暗势力利用它"
  → 标题: "露西与黑暗咒语" （抓住主角+核心冲突）

- 用户描述: "A brave knight fights a dragon to save the kingdom"
  → 标题: "Dragon Slayer" （抓住核心行为+对手）

**避免的错误**：
❌ 太长："小明在现代社会中艰难学习编程技术的励志成长故事"
❌ 太虚："成长的足迹"、"梦想启航" （太空泛，缺乏具体性）
❌ 偏离主题："编程改变世界" （如果故事核心是小明个人成长，这就偏了）
❌ 过度修饰："勇敢无畏的小明踏上编程征途"

**输出要求**：
- 只输出标题本身，不要任何解释
- 不要引号、书名号等标点符号
- 严格控制长度"""

        user_message = f"用户的故事描述：{prompt}{context_info}"

        try:
            if self.text_provider == "codex":
                logger.info("Using Codex OAuth for title generation")
                title = generate_codex_text_core(
                    system_prompt=system_prompt,
                    user_prompt=user_message,
                    model=self.model,
                    reasoning_effort=self.reasoning_effort
                ).strip()

                title = title.strip('"').strip("'").strip('「').strip('」').strip()
                if not title:
                    logger.error("Title is empty after stripping quotes")
                    raise ValueError("Generated title is empty")

                logger.info(f"Title generated successfully with Codex OAuth: {title}")
                return title
            elif self.api_key:
                # Use OpenAI API
                logger.info("Using OpenAI API for title generation")
                llm = ChatOpenAI(
                    model=self.model,
                    openai_api_key=self.api_key,
                    base_url=self.base_url,
                    temperature=0.6,
                    max_tokens=30
                )

                response = llm.invoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_message)
                ])

                # Extract title from response
                if not response or not response.content:
                    logger.error(f"Empty response from OpenAI API. Response: {response}")
                    raise ValueError("OpenAI API returned empty response")

                title = response.content.strip()

                # Remove quotation marks if present
                title = title.strip('"').strip("'").strip('「').strip('」').strip()

                # Validate title is not empty after stripping
                if not title:
                    logger.error("Title is empty after stripping quotes")
                    raise ValueError("Generated title is empty")

                logger.info(f"Title generated successfully with OpenAI: {title}")
                return title
            elif self.google_api_key:
                # Use Google Gemini API as fallback
                logger.info("Using Google Gemini API for title generation")
                logger.debug(f"System prompt length: {len(system_prompt)}")
                logger.debug(f"User message: {user_message[:200]}...")

                client = genai.Client(api_key=self.google_api_key)
                response = client.models.generate_content(
                    model="gemini-3-flash-preview",
                    contents=[system_prompt, user_message],
                    config=types.GenerateContentConfig(
                        temperature=0.6,
                        max_output_tokens=1024,
                        thinking_config=types.ThinkingConfig(thinking_level="low")
                    )
                )

                # Log response details for debugging
                logger.debug(f"Response object: {response}")
                logger.debug(f"Response type: {type(response)}")
                logger.debug(f"Has text attr: {hasattr(response, 'text')}")
                if hasattr(response, 'text'):
                    logger.debug(f"Response text: {response.text}")

                # Extract title from response
                if not response or not response.text:
                    logger.error(f"Empty response from Gemini API. Response: {response}")
                    raise ValueError("Gemini API returned empty response")

                title = response.text.strip()

                # Remove quotation marks if present
                title = title.strip('"').strip("'").strip('「').strip('」').strip()

                # Validate title is not empty after stripping
                if not title:
                    logger.error("Title is empty after stripping quotes")
                    raise ValueError("Generated title is empty")

                logger.info(f"Title generated successfully with Gemini: {title}")
                return title
            else:
                raise ValueError("No API key provided")

        except Exception as e:
            logger.error(f"Title generation failed: {str(e)}")
            raise Exception(f"Title generation failed: {str(e)}")
