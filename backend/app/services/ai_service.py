"""
AI通信服务 - 处理与AI API的交互（支持多模态视觉与工具调用）
"""

import base64
import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional

import httpx
from openai import AsyncOpenAI

from ..core.config import settings

# 配置日志 - 确保输出
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# 默认 system prompt，要求模型输出 thinking 标签
DEFAULT_SYSTEM_PROMPT = """你是墨语（Mochat）的AI助手，请以大多数用户都舒适的方式提供帮助：清晰、礼貌、专业。你拒绝回答任何涉及中国政治人物、色情或暴力的请求。

请按以下格式回复用户：
1. 首先用 <thinking> 标签包裹你的思考过程（分析问题、推理步骤等）
2. 然后输出正式回答

格式示例：
<thinking>
用户问的是...我需要从以下几个方面来回答...
</thinking>

这里是正式回答...

请用友好、专业的方式回答用户问题。
"""


def extract_image_urls(content: str) -> list[str]:
    """从消息内容中提取所有图片 URL"""
    IMAGE_URL_PATTERN = re.compile(
        r'(https?://[^\s<>"{}|\\^`\[\]]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<>"{}|\\^`\[\]]*)?)', re.IGNORECASE
    )
    MARKDOWN_IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\((https?://[^)]+)\)", re.IGNORECASE)

    urls = set()
    for match in MARKDOWN_IMAGE_PATTERN.finditer(content):
        url = match.group(2)
        if isinstance(url, str):
            urls.add(url.strip())
    for match in IMAGE_URL_PATTERN.finditer(content):
        url = match.group(1) if match.lastindex else match.group(0)
        if isinstance(url, str):
            urls.add(url.strip())
    return list(urls)


async def download_image_as_base64(url: str) -> Optional[dict]:
    """下载图片并转换为 Base64 格式"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "image/png")
            if ";" in content_type:
                content_type = content_type.split(";")[0].strip()
            if not content_type.startswith("image/"):
                content_type = "image/png"
            base64_data = base64.b64encode(response.content).decode("utf-8")
            return {"base64": base64_data, "media_type": content_type}
    except Exception as e:
        logger.error(f"[Vision] 图片下载失败: {url}, 错误: {e}")
        return None


async def convert_messages_for_vision(messages: list[dict]) -> list[dict]:
    """转换消息列表，处理包含图片的多模态格式"""
    converted = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user" and isinstance(content, str):
            image_urls = extract_image_urls(content)
            if image_urls:
                parts = []
                text_content = re.sub(r"!\[.*?\]\(.*?\)", "", content)
                for url in image_urls:
                    text_content = text_content.replace(url, "")
                text_content = text_content.strip() or "请描述这张图片"
                parts.append({"type": "text", "text": text_content})
                for url in image_urls:
                    validated_url = url.strip()
                    image_data = await download_image_as_base64(validated_url)
                    if image_data:
                        parts.append(
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{image_data['media_type']};base64,{image_data['base64']}"},
                            }
                        )
                    else:
                        parts.append({"type": "image_url", "image_url": {"url": validated_url}})
                converted.append({"role": role, "content": parts})
                continue
        converted.append(msg)
    return converted


class AIService:
    """AI通信服务类"""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.AI_API_KEY, base_url=settings.AI_BASE_URL)
        self.default_model = settings.AI_MODEL
        self._models_cache: Optional[list[dict]] = None
        self._models_cache_time: float = 0

    async def close(self):
        """关闭所有 HTTP 连接"""
        await self.client.close()

    async def get_models(self) -> list[dict]:
        """获取可用的模型列表"""
        import time

        if self._models_cache and (time.time() - self._models_cache_time) < 300:
            return self._models_cache
        try:
            response = await self.client.models.list()
            models = [{"id": m.id, "name": m.id, "owned_by": getattr(m, "owned_by", None)} for m in response.data]
            models.sort(key=lambda x: x["id"])
            self._models_cache = models
            self._models_cache_time = time.time()
            return models
        except Exception as e:
            logger.error(f"[AI] 获取模型列表失败: {e}")
            return [{"id": self.default_model, "name": self.default_model, "owned_by": None}]

    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> AsyncGenerator[dict, None]:
        """
        流式对话，支持多模态视觉与工具调用 (Function Calling)
        """
        chat_messages = [{"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}]
        chat_messages.extend(await convert_messages_for_vision(messages))

        use_model = model or self.default_model
        logger.info(f"[AI] 使用模型: {use_model}, Tools: {len(tools) if tools else 0}")

        try:
            params = {
                "model": use_model,
                "messages": chat_messages,
                "stream": True,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if tools:
                params["tools"] = tools
                params["tool_choice"] = "auto"

            response = await self.client.chat.completions.create(**params)

            thinking_buffer = ""
            content_buffer = ""
            tool_calls_buffer = {}
            in_thinking = False
            tag_buffer = ""

            async for chunk in response:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta

                # 处理工具调用
                if delta.tool_calls:
                    for tool_call in delta.tool_calls:
                        idx = tool_call.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {
                                "id": tool_call.id,
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            }
                        if tool_call.function.name:
                            tool_calls_buffer[idx]["function"]["name"] += tool_call.function.name
                        if tool_call.function.arguments:
                            tool_calls_buffer[idx]["function"]["arguments"] += tool_call.function.arguments
                    continue

                if not delta.content:
                    continue

                text = tag_buffer + delta.content
                tag_buffer = ""

                if "<" in text:
                    last_lt = text.rfind("<")
                    after_lt = text[last_lt:]
                    if ">" not in after_lt and len(after_lt) < 15:
                        tag_buffer = after_lt
                        text = text[:last_lt]
                        if not text:
                            continue

                start_match = re.search(r"<(thinking|think)>", text, re.IGNORECASE)
                if start_match:
                    in_thinking = True
                    before_tag = text[: start_match.start()]
                    if before_tag.strip():
                        content_buffer += before_tag
                        yield {"type": "content", "data": before_tag}
                    text = text[start_match.end() :]

                end_match = re.search(r"</(thinking|think)>", text, re.IGNORECASE)
                if end_match:
                    in_thinking = False
                    before_end = text[: end_match.start()]
                    if before_end:
                        thinking_buffer += before_end
                        yield {"type": "thinking", "data": before_end}
                    after_end = text[end_match.end() :]
                    if after_end.strip():
                        content_buffer += after_end
                        yield {"type": "content", "data": after_end}
                    continue

                if text:
                    if in_thinking:
                        thinking_buffer += text
                        yield {"type": "thinking", "data": text}
                    else:
                        content_buffer += text
                        yield {"type": "content", "data": text}

            if tag_buffer:
                if in_thinking:
                    yield {"type": "thinking", "data": tag_buffer}
                else:
                    yield {"type": "content", "data": tag_buffer}

            # 如果包含工具调用，以特殊格式输出
            if tool_calls_buffer:
                tool_calls_list = sorted(tool_calls_buffer.values(), key=lambda x: x["id"])
                yield {"type": "tool_calls", "data": json.dumps(tool_calls_list)}
            else:
                yield {"type": "done", "data": json.dumps({"thinking": thinking_buffer, "content": content_buffer})}

        except Exception as e:
            logger.error(f"[AI] 调用失败: {e}")
            yield {"type": "error", "data": str(e)}

    async def chat_simple(
        self, messages: list[dict], system_prompt: Optional[str] = None, model: Optional[str] = None
    ) -> tuple[str, str]:
        """简单对话（非流式），返回完整响应"""
        thinking = ""
        content = ""
        async for chunk in self.chat_stream(messages, system_prompt, model):
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
                model=self.default_model,
                messages=[
                    {
                        "role": "system",
                        "content": "根据用户的第一条消息，生成一个简短的对话标题（不超过20个字）。只返回标题，不要其他内容。",
                    },
                    {"role": "user", "content": first_message},
                ],
                max_tokens=50,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()[:50]
        except Exception as e:
            logger.warning(f"[AI] 生成对话标题失败: {e}")
            return first_message[:20] + "..." if len(first_message) > 20 else first_message


# 创建全局实例
ai_service = AIService()
