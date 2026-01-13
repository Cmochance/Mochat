"""
AI通信服务 - 处理与AI API的交互（支持多模态视觉）
"""
import json
import re
import logging
import base64
import httpx
from typing import AsyncGenerator, Optional, Union
from openai import AsyncOpenAI
from ..core.config import settings

# 配置日志 - 确保输出
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# HTTP 客户端用于下载图片
http_client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)

# 默认 system prompt，要求模型输出 thinking 标签
DEFAULT_SYSTEM_PROMPT = """你是墨语（Mochat）的AI助手，一个具有中国传统水墨风格的智能对话系统。你拒绝回答任何涉及中国政治人物、色情或暴力的请求。

请按以下格式回复用户：
1. 首先用 <thinking> 标签包裹你的思考过程（分析问题、推理步骤等）
2. 然后输出正式回答

格式示例：
<thinking>
用户问的是...我需要从以下几个方面来回答...
</thinking>

这里是正式回答...

请用友好、专业的方式回答用户问题。"""


# 图片 URL 正则（支持常见图片格式，包含查询参数）
IMAGE_URL_PATTERN = re.compile(
    r'(https?://[^\s<>"{}|\\^`\[\]]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<>"{}|\\^`\[\]]*)?)',
    re.IGNORECASE
)

# Markdown 图片语法正则：![alt](url)
MARKDOWN_IMAGE_PATTERN = re.compile(
    r'!\[([^\]]*)\]\((https?://[^)]+)\)',
    re.IGNORECASE
)


def extract_image_urls(content: str) -> list[str]:
    """
    从消息内容中提取所有图片 URL
    
    Args:
        content: 消息内容
    
    Returns:
        list[str]: 图片 URL 字符串列表（已去重）
    """
    urls = set()
    
    # 1. 从 Markdown 图片语法提取
    for match in MARKDOWN_IMAGE_PATTERN.finditer(content):
        url = match.group(2)
        if isinstance(url, str):
            urls.add(url.strip())
    
    # 2. 从普通 URL 提取
    for match in IMAGE_URL_PATTERN.finditer(content):
        url = match.group(1) if match.lastindex else match.group(0)
        if isinstance(url, str):
            urls.add(url.strip())
    
    return list(urls)


async def download_image_as_base64(url: str) -> Optional[dict]:
    """
    下载图片并转换为 Base64 格式
    
    Args:
        url: 图片 URL
    
    Returns:
        dict: {"base64": "...", "media_type": "image/png"} 或 None
    """
    try:
        print(f"[Vision] 正在下载图片: {url}")
        response = await http_client.get(url)
        response.raise_for_status()
        
        # 获取内容类型
        content_type = response.headers.get("content-type", "image/png")
        if ";" in content_type:
            content_type = content_type.split(";")[0].strip()
        
        # 确保是图片类型
        if not content_type.startswith("image/"):
            content_type = "image/png"  # 默认
        
        # 转换为 Base64
        image_data = response.content
        base64_data = base64.b64encode(image_data).decode("utf-8")
        
        print(f"[Vision] 图片下载成功: {len(image_data)} bytes, type={content_type}")
        
        return {
            "base64": base64_data,
            "media_type": content_type
        }
    except Exception as e:
        print(f"[Vision] 图片下载失败: {url}, 错误: {e}")
        return None


def validate_image_url(url: str) -> str:
    """
    验证并清理图片 URL，确保返回纯字符串
    
    Args:
        url: 原始 URL（可能是任意类型）
    
    Returns:
        str: 清理后的 URL 字符串
    
    Raises:
        ValueError: 如果 URL 无效
    """
    # 强制转换为字符串
    if not isinstance(url, str):
        logger.warning(f"[Vision] URL 不是字符串，类型为 {type(url)}: {url}")
        url = str(url)
    
    # 清理空白字符
    url = url.strip()
    
    # 验证是否为有效 URL
    if not url.startswith(('http://', 'https://')):
        raise ValueError(f"无效的图片 URL: {url}")
    
    return url


async def parse_content_for_vision(content: str) -> Union[str, list]:
    """
    解析消息内容，如果包含图片 URL 则下载并转换为 Base64 格式
    
    Args:
        content: 原始消息内容
    
    Returns:
        str: 无图片时返回原字符串
        list: 有图片时返回 OpenAI 多模态格式数组（使用 Base64）
    """
    # 确保 content 是字符串
    if not isinstance(content, str):
        logger.warning(f"[Vision] content 不是字符串: {type(content)}")
        return str(content)
    
    # 提取所有图片 URL
    image_urls = extract_image_urls(content)
    
    if not image_urls:
        return content  # 无图片，保持原格式
    
    print(f"[Vision] 检测到 {len(image_urls)} 张图片，准备下载并转换为 Base64")
    
    # 移除图片相关内容后的纯文本
    text_content = content
    
    # 移除 Markdown 图片语法 ![alt](url)
    text_content = MARKDOWN_IMAGE_PATTERN.sub('', text_content)
    
    # 移除普通图片 URL
    for url in image_urls:
        text_content = text_content.replace(url, '')
    
    text_content = text_content.strip()
    
    # 构建多模态内容数组
    parts: list[dict] = []
    
    # 添加文本部分
    if text_content:
        parts.append({
            "type": "text",
            "text": text_content
        })
    else:
        # 如果只有图片没有文本，添加默认提示
        parts.append({
            "type": "text",
            "text": "请描述这张图片"
        })
    
    # 下载图片并转换为 Base64
    for url in image_urls:
        try:
            validated_url = validate_image_url(url)
            
            # 下载图片并转换为 Base64
            image_data = await download_image_as_base64(validated_url)
            
            if image_data:
                # 使用 Data URL 格式（Base64 编码）
                data_url = f"data:{image_data['media_type']};base64,{image_data['base64']}"
                
                image_part = {
                    "type": "image_url",
                    "image_url": {
                        "url": data_url
                    }
                }
                parts.append(image_part)
                print(f"[Vision] 图片已转换为 Base64: {validated_url[:50]}... ({len(image_data['base64'])} chars)")
            else:
                # 下载失败，尝试使用原始 URL（可能某些 API 支持）
                print(f"[Vision] 图片下载失败，使用原始 URL: {validated_url}")
                image_part = {
                    "type": "image_url",
                    "image_url": {
                        "url": validated_url
                    }
                }
                parts.append(image_part)
            
        except ValueError as e:
            logger.error(f"[Vision] 跳过无效图片: {e}")
            continue
    
    # 如果没有有效图片，返回原文本
    if len(parts) == 1 and parts[0]["type"] == "text":
        return content
    
    print(f"[Vision] 构建多模态消息完成，共 {len(parts)} 个部分")
    return parts


async def convert_messages_for_vision(messages: list[dict]) -> list[dict]:
    """
    转换消息列表，将包含图片的用户消息转换为多模态格式（Base64）
    
    Args:
        messages: 原始消息列表
    
    Returns:
        list: 转换后的消息列表（兼容 OpenAI Vision API）
    """
    converted = []
    
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        # 只处理用户消息的文本内容
        if role == "user" and isinstance(content, str):
            parsed_content = await parse_content_for_vision(content)
            converted.append({
                "role": role,
                "content": parsed_content
            })
        else:
            # 助手消息或已处理的消息保持原样
            converted.append(msg)
    
    return converted


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
        支持多模态（图片）输入
        
        Yields:
            dict: {"type": "thinking" | "content" | "done" | "error", "data": str}
        """
        # 构建消息列表
        chat_messages = []
        
        if system_prompt:
            chat_messages.append({"role": "system", "content": system_prompt})
        else:
            chat_messages.append({"role": "system", "content": DEFAULT_SYSTEM_PROMPT})
        
        # 转换消息为多模态格式（如果包含图片，会下载并转为 Base64）
        converted_messages = await convert_messages_for_vision(messages)
        chat_messages.extend(converted_messages)
        
        # 调试日志：打印最终发送的消息结构
        print(f"[Vision] 准备发送 {len(chat_messages)} 条消息到 AI")
        for i, msg in enumerate(chat_messages):
            content = msg.get("content")
            role = msg.get("role")
            if isinstance(content, list):
                print(f"[Vision] 消息 {i} ({role}) 是多模态格式，包含 {len(content)} 个部分")
                for j, part in enumerate(content):
                    part_type = part.get("type")
                    if part_type == "image_url":
                        img_url = part.get("image_url", {}).get("url", "N/A")
                        url_type = type(img_url).__name__
                        # 检查是否是 Base64 格式
                        if img_url.startswith("data:"):
                            print(f"  [Part {j}] type=image_url, format=BASE64, size={len(img_url)} chars")
                        else:
                            print(f"  [Part {j}] type=image_url, format=URL, url={img_url[:80]}...")
                    elif part_type == "text":
                        text = part.get("text", "")
                        print(f"  [Part {j}] type=text, text={text[:50]}...")
            else:
                content_preview = str(content)[:100] if content else "empty"
                print(f"[Vision] 消息 {i} ({role}) 是纯文本: {content_preview}...")
        
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
            logger.error(f"[AI] 调用失败: {e}")
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
