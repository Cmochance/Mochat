"""
应用配置模块 - 管理所有环境变量和配置
"""
from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


# 获取项目根目录（backend的上级目录）
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    """应用配置类"""
    
    # 应用基础配置
    APP_NAME: str = "Mochat"
    DEBUG: bool = True
    
    # 安全配置
    SECRET_KEY: str = "your-super-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24小时
    
    # 数据库配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./mochat.db"
    
    # AI配置
    AI_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-4"
    AI_MAX_TOKENS: int = 4096
    AI_TEMPERATURE: float = 0.7
    
    # CORS配置
    CORS_ORIGINS: str = "http://localhost:3721,http://localhost:3000"

    # 微服务内部地址（网关转发）
    PICGEN_INTERNAL_URL: str = "http://picgenerate:3903"
    PPTGEN_INTERNAL_URL: str = "http://pptgen:3904"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "allow"


# 创建全局配置实例
settings = Settings()
