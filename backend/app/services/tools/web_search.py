"""
联网搜索工具
允许 AI 助手通过 SearXNG/DuckDuckGo 实时获取互联网上的最新信息，解决大模型知识时效性不足的问题。
"""

import logging
from typing import Dict, List

from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)


def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    使用 DuckDuckGo 执行联网搜索。

    Args:
        query: 搜索关键词
        max_results: 返回结果数量

    Returns:
        搜索结果列表，包含标题、链接和摘要
    """
    try:
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")})
        return results
    except Exception as e:
        logger.error(f"联网检索失败: {e}")
        return [{"error": f"搜索失败: {str(e)}"}]


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "当用户询问的事实超出你的知识库范围、需要实时新闻、或需要查找最新数据（如天气、股价、比赛结果）时，调用此工具在互联网上进行搜索。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "要搜索的关键词或问题。请使用精确、简短的关键词。"}
            },
            "required": ["query"],
        },
    },
}
