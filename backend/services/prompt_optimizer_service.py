"""Prompt optimization service"""
import logging
from typing import Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class PromptOptimizerService:
    """Prompt optimizer using OpenAI or Google API"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-4o-mini",
        comic_style: str = "doraemon",
        language: str = "zh",
        google_api_key: Optional[str] = None
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.comic_style = comic_style
        self.language = language
        self.google_api_key = google_api_key
    
    def optimize_prompt(self, prompt: str) -> str:
        """
        Optimize user's simple prompt into detailed comic storyboard description

        Args:
            prompt: User's simple prompt

        Returns:
            Optimized detailed prompt suitable for comic generation
        """
        # Define style descriptions
        style_descriptions = {
            "doraemon": "哆啦A梦风格：圆润可爱的角色设计，简洁明快的线条，温馨幽默的氛围",
            "american": "美式漫画风格：夸张的肌肉线条，英雄主义，强烈的明暗对比",
            "watercolor": "水彩风格：柔和的色彩过渡，艺术感的笔触，梦幻氛围",
            "disney": "迪士尼动画风格：经典的迪士尼角色设计，流畅的动作表现，丰富的表情，温暖明亮的色彩，充满魔法和梦幻的氛围",
            "ghibli": "宫崎骏/吉卜力风格：细腻的自然场景描绘，柔和温暖的色调，充满想象力的奇幻元素，人物表情细腻生动，富有诗意和治愈感",
            "pixar": "皮克斯动画风格：3D渲染质感，圆润可爱的角色设计，丰富的光影效果，细腻的材质表现，情感表达真挚动人",
            "shonen": "日本少年漫画风格：充满动感的线条和速度线，夸张的表情和动作，热血激昂的氛围，强烈的视觉冲击力，快节奏的分镜",
            "tom_and_jerry": "猫和老鼠风格：经典的2D手绘动画风格，夸张的肢体动作和表情，充满活力的追逐和闹剧元素，鲜艳明快的色彩"
        }
        
        # Define language instructions
        language_instructions = {
            "zh": "请用中文优化提示词。",
            "en": "Please optimize the prompt in English.",
            "ja": "日本語でプロンプトを最適化してください。"
        }
        
        style_desc = style_descriptions.get(self.comic_style, style_descriptions["doraemon"])
        language_instruction = language_instructions.get(self.language, language_instructions["zh"])
        
        system_prompt = f"""You are a professional comic storyboard prompt optimizer. Your task is to take a user's simple idea and expand it into a detailed, vivid description suitable for comic storyboard generation.

**Comic Style Context**: {style_desc}

**Language Requirement**: {language_instruction}

**Your Task**:
1. Understand the user's core idea and intent
2. Expand it with rich visual details suitable for comic panels:
   - Character descriptions (appearance, expressions, clothing)
   - Scene settings (location, atmosphere, time of day)
   - Key actions and interactions
   - Emotional tones and story beats
3. Structure the description to support multi-panel storytelling
4. Make it vivid and specific enough for visual generation
5. Keep it concise but comprehensive (2-4 sentences)

**Output Format**:
- Single paragraph with clear, visual descriptions
- Include specific details about characters, settings, and actions
- Maintain story flow and coherence
- Emphasize visual elements over abstract concepts

**Important**:
- Focus on what CAN BE SEEN in comic panels
- Use concrete visual language
- Consider the specified comic style in your descriptions
- Output ONLY the optimized prompt, no explanations or meta-commentary"""

        try:
            if self.google_api_key:
                # Use Google Gemini API (preferred)
                logger.info("Using Google Gemini API for prompt optimization")
                client = genai.Client(api_key=self.google_api_key)
                response = client.models.generate_content(
                    model="gemini-3-flash-preview",
                    contents=[system_prompt, prompt],
                    config=types.GenerateContentConfig(
                        temperature=0.7,
                        thinking_config=types.ThinkingConfig(thinking_level="low")
                    )
                )
                
                optimized = response.text.strip()
                logger.info(f"Prompt optimized successfully with Gemini: {len(optimized)} chars")
                return optimized
                
            elif self.api_key:
                # Use OpenAI API
                logger.info("Using OpenAI API for prompt optimization")
                llm = ChatOpenAI(
                    model=self.model,
                    openai_api_key=self.api_key,
                    base_url=self.base_url,
                    temperature=0.7,
                    max_tokens=500
                )
                
                response = llm.invoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=prompt)
                ])
                
                optimized = response.content.strip()
                logger.info(f"Prompt optimized successfully with OpenAI: {len(optimized)} chars")
                return optimized
            else:
                raise ValueError("No API key provided")
                
        except Exception as e:
            logger.error(f"Prompt optimization failed: {str(e)}")
            raise Exception(f"Prompt optimization failed: {str(e)}")
