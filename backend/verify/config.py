"""
验证码模块配置 - 独立配置，不依赖主应用
"""
import os
from pathlib import Path


class VerifyConfig:
    """验证码模块配置类"""
    
    # Resend API 配置
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "noreply@auth.mochance.xyz")
    
    # 验证码配置
    CODE_LENGTH: int = int(os.getenv("VERIFY_CODE_LENGTH", "6"))
    CODE_EXPIRE_MINUTES: int = int(os.getenv("VERIFY_CODE_EXPIRE_MINUTES", "5"))
    
    # 安全限制
    MAX_ATTEMPTS: int = int(os.getenv("VERIFY_MAX_ATTEMPTS", "5"))
    SEND_COOLDOWN_SECONDS: int = int(os.getenv("VERIFY_SEND_COOLDOWN_SECONDS", "60"))
    IP_HOURLY_LIMIT: int = int(os.getenv("VERIFY_IP_HOURLY_LIMIT", "10"))
    LOCKOUT_MINUTES: int = 30  # 错误次数超限后锁定时间
    
    # 模板路径
    TEMPLATE_DIR: Path = Path(__file__).parent / "templates"
    
    # 验证码用途
    PURPOSE_REGISTER = "register"
    PURPOSE_RESET_PASSWORD = "reset_password"
    VALID_PURPOSES = [PURPOSE_REGISTER, PURPOSE_RESET_PASSWORD]
    
    # 邮件主题
    EMAIL_SUBJECTS = {
        PURPOSE_REGISTER: "【墨语】您的注册验证码",
        PURPOSE_RESET_PASSWORD: "【墨语】您的密码重置验证码",
    }


# 全局配置实例
config = VerifyConfig()
