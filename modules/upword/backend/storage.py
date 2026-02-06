"""
R2 云存储服务 - 文档上传与下载
"""
import io
import uuid
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
    
    def download_to_memory(self, object_key: str) -> io.BytesIO:
        """
        从 R2 下载文件到内存
        
        Args:
            object_key: R2 中的对象键 (文件路径)
            
        Returns:
            BytesIO: 文件内容的内存流
        """
        try:
            response = self.client.get_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=object_key
            )
            file_stream = io.BytesIO(response['Body'].read())
            file_stream.seek(0)
            return file_stream
        except Exception as e:
            raise Exception(f"文件下载失败: {str(e)}")


# 导出单例
storage_service = R2StorageService()
