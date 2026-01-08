"""
AI通信服务 - 处理与AI API的交互
"""
import json
from typing import AsyncGenerator, Optional
from openai import AsyncOpenAI
from ..core.config import settings


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
            chat_messages.append({
                "role": "system", 
                "content": "你是Mochat的AI助手，一个具有中国传统水墨风格的智能对话系统。请用友好、专业的方式回答用户问题。"
            })
        
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
            thinking_started = False
            
            async for chunk in response:
                if not chunk.choices:
                    continue
                    
                delta = chunk.choices[0].delta
                if not delta.content:
                    continue
                
                text = delta.content
                
                # 检测thinking标签
                # 支持多种thinking格式：<thinking>、<think>、【思考】等
                if "<thinking>" in text.lower() or "<think>" in text.lower():
                    in_thinking = True
                    thinking_started = True
                    # 移除标签
                    text = text.replace("<thinking>", "").replace("<think>", "")
                    text = text.replace("<Thinking>", "").replace("<Think>", "")
                    
                if "</thinking>" in text.lower() or "</think>" in text.lower():
                    in_thinking = False
                    # 移除标签
                    text = text.replace("</thinking>", "").replace("</think>", "")
                    text = text.replace("</Thinking>", "").replace("</Think>", "")
                    if thinking_buffer:
                        yield {"type": "thinking", "data": text}
                    continue
                
                if in_thinking:
                    thinking_buffer += text
                    yield {"type": "thinking", "data": text}
                else:
                    content_buffer += text
                    yield {"type": "content", "data": text}
            
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
