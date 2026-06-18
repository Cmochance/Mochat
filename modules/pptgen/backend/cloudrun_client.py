"""
Cloud Run PPT 生成服务客户端
调用 Cloud Run 服务将 JSON 转换为 PPTX 并上传到 R2
"""
import asyncio
import logging
import uuid
import httpx
from config import settings


logger = logging.getLogger(__name__)


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
    
    def _build_headers(self, request_id: str) -> dict:
        headers = {
            "Content-Type": "application/json",
            "X-Request-ID": request_id,
        }
        # 如果配置了认证密钥，添加到请求头
        if settings.CLOUDRUN_SECRET:
            headers["X-Auth-Secret"] = settings.CLOUDRUN_SECRET
        return headers
    
    def _build_timeout(self) -> httpx.Timeout:
        total = max(1, settings.CLOUDRUN_TIMEOUT_SECONDS)
        connect = max(1, settings.CLOUDRUN_CONNECT_TIMEOUT_SECONDS)
        return httpx.Timeout(timeout=total, connect=connect)
    
    @staticmethod
    def _is_retryable_status(status_code: int) -> bool:
        return status_code in (408, 425, 429, 500, 502, 503, 504)
    
    async def _sleep_before_retry(self, attempt: int) -> None:
        base_seconds = max(0, settings.CLOUDRUN_RETRY_BASE_MS) / 1000.0
        delay = base_seconds * (2 ** (attempt - 1))
        if delay > 0:
            await asyncio.sleep(delay)
    
    @staticmethod
    def _extract_error_detail(response: httpx.Response) -> str:
        detail = response.text
        try:
            payload = response.json()
            detail = payload.get("error", detail)
        except Exception:
            pass
        return detail
    
    async def generate_pptx(
        self,
        ppt_json: dict,
        user_id: str = "anonymous",
        request_id: str | None = None,
    ) -> CloudRunResult:
        """
        调用 Cloud Run 服务生成 PPTX 文件并上传到 R2
        
        Args:
            ppt_json: PPT 的 JSON 结构数据
            user_id: 用户标识，用于 R2 存储路径
            request_id: 请求链路 ID
            
        Returns:
            CloudRunResult: 包含 url 和 title 的结果对象
        """
        rid = request_id or str(uuid.uuid4())
        headers = self._build_headers(rid)
        
        # 构建请求体，包含 user_id 用于 R2 路径
        request_body = {
            "ppt_data": ppt_json,
            "user_id": user_id,
            "filename": ppt_json.get("title", "presentation")
        }

        max_attempts = max(1, settings.CLOUDRUN_RETRY_TIMES + 1)
        timeout = self._build_timeout()
        last_exception: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        settings.CLOUDRUN_URL,
                        headers=headers,
                        json=request_body,
                    )

                if response.status_code != 200:
                    detail = self._extract_error_detail(response)
                    if self._is_retryable_status(response.status_code) and attempt < max_attempts:
                        logger.warning(
                            "cloudrun retrying due to status=%s attempt=%s/%s request_id=%s",
                            response.status_code,
                            attempt,
                            max_attempts,
                            rid,
                        )
                        await self._sleep_before_retry(attempt)
                        continue
                    raise CloudRunError(f"Cloud Run 错误 ({response.status_code}): {detail}")

                try:
                    result = response.json()
                except Exception:
                    raise CloudRunError("Cloud Run 返回的不是有效的 JSON")

                if result.get("status") != "success":
                    error_msg = result.get("error", "未知错误")
                    raise CloudRunError(f"Cloud Run 处理失败: {error_msg}")

                url = result.get("url")
                if not url:
                    raise CloudRunError("Cloud Run 未返回 PPT 下载链接")

                title = result.get("title", ppt_json.get("title", "演示文稿"))
                return CloudRunResult(url=url, title=title)

            except (httpx.TimeoutException, httpx.RequestError) as e:
                last_exception = e
                if attempt < max_attempts:
                    logger.warning(
                        "cloudrun retrying due to network issue attempt=%s/%s request_id=%s error=%s",
                        attempt,
                        max_attempts,
                        rid,
                        str(e),
                    )
                    await self._sleep_before_retry(attempt)
                    continue
                break

        if isinstance(last_exception, httpx.TimeoutException):
            raise CloudRunError("Cloud Run 请求超时，PPT 生成可能需要更长时间")
        if isinstance(last_exception, httpx.RequestError):
            raise CloudRunError(f"网络请求错误: {str(last_exception)}")
        raise CloudRunError("Cloud Run 调用失败")

    async def healthcheck(self, request_id: str | None = None) -> tuple[bool, str]:
        """探测 Cloud Run 可达性与鉴权可用性"""
        rid = request_id or str(uuid.uuid4())
        headers = self._build_headers(rid)
        timeout = httpx.Timeout(timeout=10, connect=5)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    settings.CLOUDRUN_URL,
                    params={"debug": "versions"},
                    headers=headers,
                )
            if response.status_code == 200:
                return True, "ok"
            if response.status_code == 401:
                return False, "unauthorized"
            return False, f"http_{response.status_code}"
        except Exception as e:
            return False, f"network_error: {str(e)}"


# 导出单例（懒加载）
_client_instance = None

def get_cloudrun_client() -> CloudRunClient:
    global _client_instance
    if _client_instance is None:
        _client_instance = CloudRunClient()
    return _client_instance
