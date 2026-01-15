"""
Prompt 翻译优化服务
将用户输入的中文 prompt 翻译并优化为英文绘图 prompt
"""
import httpx
from typing import AsyncGenerator
from config import settings


class PromptTranslatorError(Exception):
    """翻译优化错误"""
    pass


SYSTEM_PROMPT = """You are an expert AI image prompt engineer. Your task is to translate and optimize user prompts for AI image generation.

Rules:
1. Translate Chinese prompts to English
2. Enhance the prompt with artistic details (style, lighting, composition, etc.)
3. Keep the core subject and intent unchanged
4. Output ONLY the optimized English prompt, nothing else
5. Make the prompt detailed but concise (under 500 characters)

Example:
Input: 一只戴墨镜的橘猫在沙滩上晒太阳
Output: An orange tabby cat wearing stylish sunglasses, lounging on a sandy beach under warm golden sunlight, ocean waves in the background, photorealistic style, soft natural lighting, shallow depth of field"""


class PromptTranslator:
    """Prompt 翻译优化器"""
    
    def __init__(self):
        if not settings.TRANSLATOR_API_KEY:
            raise PromptTranslatorError("PICGEN_TRANSLATOR_API_KEY 未配置")
        if not settings.TRANSLATOR_API_BASE:
            raise PromptTranslatorError("PICGEN_TRANSLATOR_API_BASE 未配置")
    
    async def translate(self, prompt: str) -> str:
        """
        翻译并优化 prompt（非流式，直接返回结果）
        """
        headers = {
            "Authorization": f"Bearer {settings.TRANSLATOR_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": settings.TRANSLATOR_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 500
        }
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{settings.TRANSLATOR_API_BASE}/chat/completions",
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
                    raise PromptTranslatorError(f"翻译 API 错误 ({response.status_code}): {error_detail}")
                
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
                
        except httpx.TimeoutException:
            raise PromptTranslatorError("翻译请求超时")
        except httpx.RequestError as e:
            raise PromptTranslatorError(f"网络请求错误: {str(e)}")
    
    async def translate_stream(self, prompt: str) -> AsyncGenerator[str, None]:
        """
        流式翻译并优化 prompt（用于实时显示 thinking 过程）
        """
        headers = {
            "Authorization": f"Bearer {settings.TRANSLATOR_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": settings.TRANSLATOR_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 500,
            "stream": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    f"{settings.TRANSLATOR_API_BASE}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status_code != 200:
                        raise PromptTranslatorError(f"翻译 API 错误 ({response.status_code})")
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                import json
                                data = json.loads(data_str)
                                delta = data.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                            except:
                                continue
                                
        except httpx.TimeoutException:
            raise PromptTranslatorError("翻译请求超时")
        except httpx.RequestError as e:
            raise PromptTranslatorError(f"网络请求错误: {str(e)}")


# 导出单例（懒加载）
_translator_instance = None

def get_translator() -> PromptTranslator:
    global _translator_instance
    if _translator_instance is None:
        _translator_instance = PromptTranslator()
    return _translator_instance
