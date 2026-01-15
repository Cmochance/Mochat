"""
Cloud Run PPT 生成服务客户端
调用 Cloud Run 服务将 JSON 转换为 PPTX
"""
import httpx
from config import settings


class CloudRunError(Exception):
    """Cloud Run 调用错误"""
    pass


class CloudRunClient:
    """Cloud Run PPT 生成服务客户端"""
    
    def __init__(self):
        if not settings.CLOUDRUN_URL:
            raise CloudRunError("PPTGEN_CLOUDRUN_URL 未配置")
    
    async def generate_pptx(self, ppt_json: dict) -> bytes:
        """
        调用 Cloud Run 服务生成 PPTX 文件
        
        Args:
            ppt_json: PPT 的 JSON 结构数据
            
        Returns:
            bytes: PPTX 文件的二进制数据
        """
        headers = {
            "Content-Type": "application/json"
        }
        
        # 如果配置了认证密钥，添加到请求头
        if settings.CLOUDRUN_SECRET:
            headers["X-Auth-Secret"] = settings.CLOUDRUN_SECRET
        
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{settings.CLOUDRUN_URL}/generate",
                    headers=headers,
                    json=ppt_json
                )
                
                if response.status_code != 200:
                    error_detail = response.text
                    try:
                        error_json = response.json()
                        error_detail = error_json.get("error", error_detail)
                    except:
                        pass
                    raise CloudRunError(f"Cloud Run 错误 ({response.status_code}): {error_detail}")
                
                # 验证返回的是 PPTX 文件
                content_type = response.headers.get("content-type", "")
                if "application/vnd.openxmlformats" not in content_type and "application/octet-stream" not in content_type:
                    raise CloudRunError(f"返回的不是 PPTX 文件: {content_type}")
                
                return response.content
                
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
