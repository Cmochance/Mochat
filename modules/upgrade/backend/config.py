"""
Upgrade 模块配置
"""
import os
from typing import List


class Settings:
    """配置类"""
    
    # 服务端口
    PORT: int = int(os.getenv("UPGRADE_PORT", "3902"))
    
    # CORS 配置
    CORS_ORIGINS: List[str] = os.getenv(
        "UPGRADE_CORS_ORIGINS",
        "http://localhost:3721,http://localhost:8721"
    ).split(",")
    
    # 当前版本号
    CURRENT_VERSION: str = os.getenv("CURRENT_VERSION", "v1.5")


settings = Settings()
