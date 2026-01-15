"""
R2 云存储服务 - 上传生成的 PPT 文件
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
    
    def upload_pptx(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) -> str:
        """
        上传 PPTX 文件到 R2
        
        Args:
            key: 文件在 R2 中的存储路径
            data: PPTX 文件二进制数据
            content_type: 文件的 MIME 类型
        
        Returns:
            str: 文件的公开访问 URL
        """
        try:
            self.client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=key,
                Body=data,
                ContentType=content_type,
                CacheControl=settings.CACHE_CONTROL,
                ContentDisposition=f'attachment; filename="{key.split("/")[-1]}"'
            )
            
            if settings.R2_PUBLIC_DOMAIN:
                return f"{settings.R2_PUBLIC_DOMAIN}/{key}"
            else:
                return f"https://{settings.R2_BUCKET_NAME}.r2.cloudflarestorage.com/{key}"
                
        except Exception as e:
            raise Exception(f"上传 PPT 文件失败: {str(e)}")
    
    def delete_file(self, key: str) -> bool:
        """删除文件"""
        try:
            self.client.delete_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=key
            )
            return True
        except Exception as e:
            print(f"删除文件失败: {str(e)}")
            return False


# 导出单例
storage_service = R2StorageService()
