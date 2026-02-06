"""
AI JSON 生成服务
调用 AI 模型生成 PPT 的 JSON 结构
"""
import httpx
import json
from typing import AsyncGenerator
from config import settings


class AIGeneratorError(Exception):
    """AI 生成错误"""
    pass


# PPT 生成系统提示词
SYSTEM_PROMPT = """你是一位专业的演示文稿设计专家。请根据用户的需求生成一份结构化的 PPT JSON 数据。

## 输出要求
1. 必须返回有效的 JSON 格式，不要包含任何其他文本（如 ```json 标记）
2. PPT 应该有清晰的逻辑结构，包含：标题页、目录页、4个章节（每章含章节页+内容页）、总结页
3. 每页幻灯片的内容要精炼，要点不超过 5 个
4. 根据主题选择合适的配色方案
5. 生成 10-15 页的演示文稿
6. 必须包含4个章节，每个章节有4-6字的简短标题和5-10字的内容摘要

## JSON 结构规范
{
  "title": "演示文稿标题",
  "author": "作者（可选，默认空）",
  "theme": {
    "primaryColor": "#1a73e8",
    "secondaryColor": "#34a853",
    "backgroundColor": "#ffffff",
    "textColor": "#202124",
    "fontFamily": "Microsoft YaHei"
  },
  "slides": [
    {
      "type": "title",
      "title": "主标题",
      "subtitle": "副标题"
    },
    {
      "type": "toc",
      "title": "目录",
      "items": [
        { "title": "章节标题", "summary": "章节内容摘要" },
        { "title": "章节标题", "summary": "章节内容摘要" },
        { "title": "章节标题", "summary": "章节内容摘要" },
        { "title": "章节标题", "summary": "章节内容摘要" }
      ]
    },
    {
      "type": "section",
      "title": "章节标题"
    },
    {
      "type": "content",
      "title": "页面标题",
      "content": [
        { "type": "text", "value": "段落文本内容" },
        { "type": "bullet", "items": ["要点1", "要点2", "要点3"] },
        { "type": "numbered", "items": ["步骤1", "步骤2"] }
      ]
    },
    {
      "type": "two-column",
      "title": "双栏布局",
      "left": [{ "type": "bullet", "items": ["左侧内容"] }],
      "right": [{ "type": "bullet", "items": ["右侧内容"] }]
    },
    {
      "type": "quote",
      "title": "引用页",
      "quote": "引用的内容",
      "author": "引用来源"
    },
    {
      "type": "thank-you",
      "title": "感谢观看",
      "subtitle": "联系方式或结束语"
    }
  ]
}

## 幻灯片类型说明
- title: 标题页，必须是第一页
- toc: 目录页，列出4个主要章节，每个章节包含 title（4-6字）和 summary（5-10字）
- section: 章节分隔页，用于引入新章节
- content: 内容页，支持多种内容类型
- two-column: 双栏布局，适合对比内容
- quote: 引用页，突出重要观点
- thank-you: 结束页，必须是最后一页

## content 数组元素类型
- { "type": "text", "value": "段落文本" }
- { "type": "bullet", "items": ["要点1", "要点2"] }
- { "type": "numbered", "items": ["步骤1", "步骤2"] }

## 目录页 items 格式（重要）
目录页的 items 必须是对象数组，每个对象包含：
- title: 章节标题，4-6个字，简洁有力
- summary: 章节摘要，5-10个字，概括章节核心内容

示例：
"items": [
  { "title": "技术原理", "summary": "核心机制与工作流程" },
  { "title": "应用场景", "summary": "典型案例与实践经验" },
  { "title": "优势分析", "summary": "与传统方案的对比" },
  { "title": "未来展望", "summary": "发展趋势与挑战" }
]

请直接返回 JSON，不要包含任何解释或 markdown 标记。"""


class AIGenerator:
    """AI JSON 生成器"""
    
    def __init__(self):
        if not settings.AI_API_KEY:
            raise AIGeneratorError("PPTGEN_AI_API_KEY 未配置")
        if not settings.AI_API_BASE:
            raise AIGeneratorError("PPTGEN_AI_API_BASE 未配置")
    
    async def generate_json(self, prompt: str) -> str:
        """
        生成 PPT JSON（非流式）
        """
        headers = {
            "Authorization": f"Bearer {settings.AI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": settings.AI_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"请为以下主题创建一份专业的演示文稿：\n\n{prompt}"}
            ],
            "temperature": 0.7,
            "max_tokens": 8000
        }
        
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{settings.AI_API_BASE}/chat/completions",
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
                    raise AIGeneratorError(f"AI API 错误 ({response.status_code}): {error_detail}")
                
                data = response.json()
                content = data["choices"][0]["message"]["content"].strip()
                
                # 清理可能的 markdown 标记
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                
                return content.strip()
                
        except httpx.TimeoutException:
            raise AIGeneratorError("AI 请求超时")
        except httpx.RequestError as e:
            raise AIGeneratorError(f"网络请求错误: {str(e)}")
    
    async def generate_json_stream(self, prompt: str) -> AsyncGenerator[str, None]:
        """
        流式生成 PPT JSON（用于实时显示生成过程）
        """
        headers = {
            "Authorization": f"Bearer {settings.AI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": settings.AI_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"请为以下主题创建一份专业的演示文稿：\n\n{prompt}"}
            ],
            "temperature": 0.7,
            "max_tokens": 8000,
            "stream": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                async with client.stream(
                    "POST",
                    f"{settings.AI_API_BASE}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status_code != 200:
                        raise AIGeneratorError(f"AI API 错误 ({response.status_code})")
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                delta = data.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                            except:
                                continue
                                
        except httpx.TimeoutException:
            raise AIGeneratorError("AI 请求超时")
        except httpx.RequestError as e:
            raise AIGeneratorError(f"网络请求错误: {str(e)}")


# 导出单例（懒加载）
_generator_instance = None

def get_ai_generator() -> AIGenerator:
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = AIGenerator()
    return _generator_instance
