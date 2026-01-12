"""
AI通信服务 - 处理与AI API的交互
"""
import json
import re
from typing import AsyncGenerator, Optional
from openai import AsyncOpenAI
from ..core.config import settings


# 默认 system prompt，要求模型输出 thinking 标签
DEFAULT_SYSTEM_PROMPT = """你是墨语（Mochat）的AI助手，一个具有中国传统水墨风格的智能对话系统。

请按以下格式回复用户：
1. 首先用 <thinking> 标签包裹你的思考过程（分析问题、推理步骤等）
2. 然后输出正式回答

格式示例：
<thinking>
用户问的是...我需要从以下几个方面来回答...
</thinking>

这里是正式回答...

请用友好、专业的方式回答用户问题。"""


class AIService:
    """AI通信服务类"""
    
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.AI_API_KEY,
            base_url=settings.AI_BASE_URL
        )
        self.model = settings.AI_MODEL
    
    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None
    ) -> AsyncGenerator[dict, None]:
        """
        流式对话，返回thinking和content分开的数据流
        
        Yields:
            dict: {"type": "thinking" | "content" | "done" | "error", "data": str}
        """
        # 构建消息列表
        chat_messages = []
        
        if system_prompt:
            chat_messages.append({"role": "system", "content": system_prompt})
        else:
            chat_messages.append({"role": "system", "content": DEFAULT_SYSTEM_PROMPT})
        
        chat_messages.extend(messages)
        
        try:
            # 调用AI API（流式）
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=chat_messages,
                stream=True,
                temperature=0.7,
                max_tokens=4096
            )
            
            thinking_buffer = ""
            content_buffer = ""
            in_thinking = False
            tag_buffer = ""  # 用于缓冲可能不完整的标签
            
            async for chunk in response:
                if not chunk.choices:
                    continue
                    
                delta = chunk.choices[0].delta
                if not delta.content:
                    continue
                
                # 合并之前缓冲的可能不完整的标签
                text = tag_buffer + delta.content
                tag_buffer = ""
                
                # 检查是否有不完整的标签（以 < 开头但没有 >）
                if '<' in text:
                    last_lt = text.rfind('<')
                    after_lt = text[last_lt:]
                    if '>' not in after_lt and len(after_lt) < 15:
                        # 可能是不完整的标签，缓冲起来
                        tag_buffer = after_lt
                        text = text[:last_lt]
                        if not text:
                            continue
                
                # 检测 thinking 开始标签
                start_match = re.search(r'<(thinking|think)>', text, re.IGNORECASE)
                if start_match:
                    in_thinking = True
                    # 开始标签之前的内容作为 content
                    before_tag = text[:start_match.start()]
                    if before_tag.strip():
                        content_buffer += before_tag
                        yield {"type": "content", "data": before_tag}
                    # 移除开始标签，剩余内容继续处理
                    text = text[start_match.end():]
                
                # 检测 thinking 结束标签
                end_match = re.search(r'</(thinking|think)>', text, re.IGNORECASE)
                if end_match:
                    in_thinking = False
                    # 结束标签之前的内容作为 thinking
                    before_end = text[:end_match.start()]
                    if before_end:
                        thinking_buffer += before_end
                        yield {"type": "thinking", "data": before_end}
                    # 结束标签之后的内容作为 content
                    after_end = text[end_match.end():]
                    if after_end.strip():
                        content_buffer += after_end
                        yield {"type": "content", "data": after_end}
                    continue
                
                # 正常内容处理
                if text:
                    if in_thinking:
                        thinking_buffer += text
                        yield {"type": "thinking", "data": text}
                    else:
                        content_buffer += text
                        yield {"type": "content", "data": text}
            
            # 处理剩余的 tag_buffer
            if tag_buffer:
                if in_thinking:
                    thinking_buffer += tag_buffer
                    yield {"type": "thinking", "data": tag_buffer}
                else:
                    content_buffer += tag_buffer
                    yield {"type": "content", "data": tag_buffer}
            
            # 完成
            yield {
                "type": "done", 
                "data": json.dumps({
                    "thinking": thinking_buffer,
                    "content": content_buffer
                })
            }
            
        except Exception as e:
            yield {"type": "error", "data": str(e)}
    
    async def chat_simple(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None
    ) -> tuple[str, str]:
        """
        简单对话（非流式），返回完整响应
        
        Returns:
            tuple: (thinking, content)
        """
        thinking = ""
        content = ""
        
        async for chunk in self.chat_stream(messages, system_prompt):
            if chunk["type"] == "thinking":
                thinking += chunk["data"]
            elif chunk["type"] == "content":
                content += chunk["data"]
            elif chunk["type"] == "error":
                raise Exception(chunk["data"])
        
        return thinking, content
    
    async def generate_title(self, first_message: str) -> str:
        """根据第一条消息生成会话标题"""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "根据用户的第一条消息，生成一个简短的对话标题（不超过20个字）。只返回标题，不要其他内容。"
                    },
                    {"role": "user", "content": first_message}
                ],
                max_tokens=50,
                temperature=0.7
            )
            return response.choices[0].message.content.strip()[:50]
        except Exception:
            return first_message[:20] + "..." if len(first_message) > 20 else first_message


# 创建全局实例
ai_service = AIService()
