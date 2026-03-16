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
    AUTH_PROVIDER: str = "legacy"  # legacy | supabase

    # Supabase 配置
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    
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

    # MCP 配置
    MCP_DEFAULT_TIMEOUT_MS: int = 15000
    MCP_MAX_TOOL_CALLS: int = 3
    MCP_APPROVAL_TTL_SECONDS: int = 600
    MCP_MAX_ARGUMENT_BYTES: int = 16384
    MCP_MAX_RESULT_TEXT_CHARS: int = 6000
    MCP_MAX_LOG_STRING_CHARS: int = 400
    MCP_MAX_LOG_ITEMS: int = 40
    MCP_RETRY_BACKOFF_MS: int = 200
    MCP_CIRCUIT_BREAKER_THRESHOLD: int = 3
    MCP_CIRCUIT_BREAKER_COOLDOWN_SECONDS: int = 30
    MCP_ASYNC_MAX_POLLS: int = 8
    MCP_ASYNC_POLL_INTERVAL_MS: int = 1200
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "allow"


# 创建全局配置实例
settings = Settings()
