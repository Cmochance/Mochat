"""
AI 图像生成服务
使用 Chat Completions 格式调用 Gemini/GPT-4o 等多模态模型生成图像
"""
import httpx
import base64
import re
from config import settings


class ImageGeneratorError(Exception):
    """图像生成错误"""
    pass


class ChatImageGenerator:
    """
    Chat Completions 格式的图像生成器
    适用于 Gemini、GPT-4o 等支持多模态输出的模型
    """
    
    def __init__(self):
        if not settings.IMAGE_API_KEY:
            raise ImageGeneratorError("PICGEN_IMAGE_API_KEY 未配置")
        if not settings.IMAGE_API_BASE:
            raise ImageGeneratorError("PICGEN_IMAGE_API_BASE 未配置")
    
    async def generate(
        self,
        prompt: str,
        size: str = "1024x1024",
        quality: str = "standard",
        **kwargs
    ) -> bytes:
        """
        通过 Chat Completions 生成图像
        
        Args:
            prompt: 图像描述提示词（应为英文）
            size: 图像尺寸提示
            quality: 质量提示
            
        Returns:
            bytes: 图像二进制数据
        """
        # 验证提示词长度
        if len(prompt) > settings.MAX_PROMPT_LENGTH:
            raise ImageGeneratorError(
                f"提示词过长，最大 {settings.MAX_PROMPT_LENGTH} 字符"
            )
        
        # 构建请求
        headers = {
            "Authorization": f"Bearer {settings.IMAGE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 构建生成图像的系统提示
        system_prompt = (
            "You are an image generation AI. Generate a high-quality image based on the user's description. "
            f"Target size: {size}, Quality: {quality}. "
            "Output ONLY the image, no text explanation."
        )
        
        payload = {
            "model": settings.IMAGE_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate an image: {prompt}"}
            ],
            "max_tokens": 4096,
        }
        
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(
                    f"{settings.IMAGE_API_BASE}/chat/completions",
                    headers=headers,
                    json=payload
                )
                
                if response.status_code != 200:
                    error_detail = response.text
                    try:
                        error_json = response.json()
                        error_detail = error_json.get("error", {}).get("message", error_detail)
                    except:
                        pass
                    raise ImageGeneratorError(f"API 错误 ({response.status_code}): {error_detail}")
                
                data = response.json()
                
                # 解析响应
                choices = data.get("choices", [])
                if not choices:
                    raise ImageGeneratorError("API 返回数据为空")
                
                message = choices[0].get("message", {})
                content = message.get("content") or ""
                
                # 尝试多种方式提取图像数据
                image_bytes = None
                
                # 方式1: 检查 message.images 字段（Gemini 等 API 格式）
                # 格式: {"images": [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}]}
                images = message.get("images", [])
                if images and len(images) > 0:
                    img_item = images[0]
                    if isinstance(img_item, dict):
                        image_url_obj = img_item.get("image_url", {})
                        if isinstance(image_url_obj, dict):
                            url_value = image_url_obj.get("url", "")
                            # data:image/jpeg;base64,xxxxx 格式
                            if url_value.startswith("data:image"):
                                base64_match = re.search(r'base64,(.+)', url_value)
                                if base64_match:
                                    image_bytes = base64.b64decode(base64_match.group(1))
                            elif url_value.startswith("http"):
                                img_response = await client.get(url_value)
                                if img_response.status_code == 200:
                                    image_bytes = img_response.content
                        elif isinstance(image_url_obj, str):
                            if image_url_obj.startswith("data:image"):
                                base64_match = re.search(r'base64,(.+)', image_url_obj)
                                if base64_match:
                                    image_bytes = base64.b64decode(base64_match.group(1))
                
                # 方式2: 检查 content 中是否有内联的 base64 图像
                if not image_bytes and content:
                    base64_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
                    match = re.search(base64_pattern, content)
                    if match:
                        image_bytes = base64.b64decode(match.group(1))
                
                # 方式3: 检查 message 中是否有 image 字段
                if not image_bytes and "image" in message:
                    img_data = message["image"]
                    if isinstance(img_data, str):
                        if img_data.startswith("http"):
                            img_response = await client.get(img_data)
                            if img_response.status_code == 200:
                                image_bytes = img_response.content
                        elif img_data.startswith("data:image"):
                            base64_match = re.search(r'base64,(.+)', img_data)
                            if base64_match:
                                image_bytes = base64.b64decode(base64_match.group(1))
                        else:
                            image_bytes = base64.b64decode(img_data)
                    elif isinstance(img_data, dict):
                        if "b64_json" in img_data:
                            image_bytes = base64.b64decode(img_data["b64_json"])
                        elif "url" in img_data:
                            img_response = await client.get(img_data["url"])
                            if img_response.status_code == 200:
                                image_bytes = img_response.content
                
                # 方式4: 检查 content 中是否有图像 URL
                if not image_bytes and content:
                    url_pattern = r'https?://[^\s\)\"\']+\.(?:png|jpg|jpeg|gif|webp)'
                    url_match = re.search(url_pattern, content, re.IGNORECASE)
                    if url_match:
                        img_url = url_match.group(0)
                        img_response = await client.get(img_url)
                        if img_response.status_code == 200:
                            image_bytes = img_response.content
                
                if not image_bytes:
                    raise ImageGeneratorError(
                        f"无法从响应中提取图像。images={len(images)}, content长度={len(content) if content else 0}"
                    )
                
                return image_bytes
                        
        except httpx.TimeoutException:
            raise ImageGeneratorError("请求超时，请稍后重试")
        except httpx.RequestError as e:
            raise ImageGeneratorError(f"网络请求错误: {str(e)}")


# 导出单例（懒加载）
_generator_instance = None

def get_generator() -> ChatImageGenerator:
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = ChatImageGenerator()
    return _generator_instance
