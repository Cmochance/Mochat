"""
联网搜索工具
允许 AI 助手通过 DuckDuckGo 实时获取互联网上的最新信息，解决大模型知识时效性不足的问题。

容灾策略：
- 指数退避重试（最多 3 次）
- 速率限制检测与优雅降级
- 超时保护
"""

import logging
import time
from typing import Dict, List

from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)

# 重试配置
MAX_RETRIES = 3
BASE_DELAY = 0.5  # 秒
REQUEST_TIMEOUT = 15  # 秒


def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    使用 DuckDuckGo 执行联网搜索，带重试和降级机制。

    Args:
        query: 搜索关键词
        max_results: 返回结果数量

    Returns:
        搜索结果列表，包含标题、链接和摘要
    """
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            results = []
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=max_results):
                    results.append(
                        {
                            "title": r.get("title", ""),
                            "url": r.get("href", ""),
                            "snippet": r.get("body", ""),
                        }
                    )

            if results:
                return results

            # 空结果也算成功（只是没搜到）
            return [{"info": f"未找到与 '{query}' 相关的搜索结果，请尝试换个关键词。"}]

        except Exception as e:
            last_error = e
            error_str = str(e).lower()

            # 速率限制：等待更长时间
            if "ratelimit" in error_str or "429" in error_str or "too many" in error_str:
                delay = BASE_DELAY * (2**attempt) * 2  # 速率限制时加倍等待
                logger.warning(f"搜索被限流 (尝试 {attempt + 1}/{MAX_RETRIES})，等待 {delay}s: {e}")
                time.sleep(delay)
                continue

            # 超时或网络错误：正常重试
            if "timeout" in error_str or "connection" in error_str or "network" in error_str:
                delay = BASE_DELAY * (2**attempt)
                logger.warning(f"搜索网络错误 (尝试 {attempt + 1}/{MAX_RETRIES})，等待 {delay}s: {e}")
                time.sleep(delay)
                continue

            # 其他错误：直接失败
            logger.error(f"搜索失败: {e}")
            break

    # 所有重试都失败，返回降级提示
    error_msg = str(last_error) if last_error else "未知错误"
    logger.error(f"搜索最终失败 (已重试 {MAX_RETRIES} 次): {error_msg}")
    return [
        {
            "error": f"搜索暂时不可用（{error_msg}）。请基于已有知识回答用户问题，并告知用户搜索功能暂时受限。",
            "fallback_hint": "建议直接基于模型知识回答，并说明实时搜索暂不可用。",
        }
    ]


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "当用户询问的事实超出你的知识库范围、需要实时新闻、或需要查找最新数据（如天气、股价、比赛结果）时，调用此工具在互联网上进行搜索。如果搜索失败，请基于已有知识回答。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "要搜索的关键词或问题。请使用精确、简短的关键词。",
                }
            },
            "required": ["query"],
        },
    },
}
