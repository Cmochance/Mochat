"""
R2 云存储服务 - 生成预签名 URL 用于客户端直传
"""
import boto3
from botocore.config import Config
from config import settings


class R2StorageService:
    """Cloudflare R2 存储服务"""
    
    def __init__(self):
        self._client = None
    
    @property
    def client(self):
        """懒加载 S3 客户端"""
        if self._client is None:
            if not settings.R2_ACCOUNT_ID:
                raise Exception("R2 配置未设置，请检查环境变量")
            
            self._client = boto3.client(
                's3',
                endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                config=Config(
                    signature_version='s3v4',
                    region_name='auto'
                )
            )
        return self._client
    
    def generate_presigned_url(
        self,
        key: str,
        content_type: str,
        expires_in: int = 3600
    ) -> dict:
        """
        生成上传用的预签名 URL
        
        Args:
            key: 文件在 R2 中的存储路径
            content_type: 文件的 MIME 类型
            expires_in: 有效期 (秒)
        
        Returns:
            dict: 包含 uploadUrl, key, publicUrl
        """
        try:
            url = self.client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': settings.R2_BUCKET_NAME,
                    'Key': key,
                    'ContentType': content_type,
                },
                ExpiresIn=expires_in
            )
            
            public_url = f"{settings.R2_PUBLIC_DOMAIN}/{key}" if settings.R2_PUBLIC_DOMAIN else ""
            
            return {
                'uploadUrl': url,
                'key': key,
                'publicUrl': public_url
            }
        except Exception as e:
            raise Exception(f"存储服务不可用: {str(e)}")


# 导出单例
storage_service = R2StorageService()
