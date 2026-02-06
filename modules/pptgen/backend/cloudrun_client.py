"""
Cloud Run PPT 生成服务客户端
调用 Cloud Run 服务将 JSON 转换为 PPTX 并上传到 R2
"""
import httpx
from typing import Optional
from config import settings


class CloudRunError(Exception):
    """Cloud Run 调用错误"""
    pass


class CloudRunResult:
    """Cloud Run 返回结果"""
    def __init__(self, url: str, title: str):
        self.url = url
        self.title = title


class CloudRunClient:
    """Cloud Run PPT 生成服务客户端"""
    
    def __init__(self):
        if not settings.CLOUDRUN_URL:
            raise CloudRunError("PPTGEN_CLOUDRUN_URL 未配置")
    
    async def generate_pptx(self, ppt_json: dict, user_id: str = "anonymous") -> CloudRunResult:
        """
        调用 Cloud Run 服务生成 PPTX 文件并上传到 R2
        
        Args:
            ppt_json: PPT 的 JSON 结构数据
            user_id: 用户标识，用于 R2 存储路径
            
        Returns:
            CloudRunResult: 包含 url 和 title 的结果对象
        """
        headers = {
            "Content-Type": "application/json"
        }
        
        # 如果配置了认证密钥，添加到请求头
        if settings.CLOUDRUN_SECRET:
            headers["X-Auth-Secret"] = settings.CLOUDRUN_SECRET
        
        # 构建请求体，包含 user_id 用于 R2 路径
        request_body = {
            "ppt_data": ppt_json,
            "user_id": user_id,
            "filename": ppt_json.get("title", "presentation")
        }
        
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    settings.CLOUDRUN_URL,
                    headers=headers,
                    json=request_body
                )
                
                if response.status_code != 200:
                    error_detail = response.text
                    try:
                        error_json = response.json()
                        error_detail = error_json.get("error", error_detail)
                    except:
                        pass
                    raise CloudRunError(f"Cloud Run 错误 ({response.status_code}): {error_detail}")
                
                # 解析 JSON 响应
                try:
                    result = response.json()
                except:
                    raise CloudRunError("Cloud Run 返回的不是有效的 JSON")
                
                # 验证响应格式
                if result.get("status") != "success":
                    error_msg = result.get("error", "未知错误")
                    raise CloudRunError(f"Cloud Run 处理失败: {error_msg}")
                
                url = result.get("url")
                if not url:
                    raise CloudRunError("Cloud Run 未返回 PPT 下载链接")
                
                title = result.get("title", ppt_json.get("title", "演示文稿"))
                
                return CloudRunResult(url=url, title=title)
                
        except httpx.TimeoutException:
            raise CloudRunError("Cloud Run 请求超时，PPT 生成可能需要更长时间")
        except httpx.RequestError as e:
            raise CloudRunError(f"网络请求错误: {str(e)}")


# 导出单例（懒加载）
_client_instance = None

def get_cloudrun_client() -> CloudRunClient:
    global _client_instance
    if _client_instance is None:
        _client_instance = CloudRunClient()
    return _client_instance
