"""
邮件发送服务 - 使用 Resend API
"""
import resend
from pathlib import Path
from typing import Optional
from .config import config


class EmailService:
    """邮件发送服务"""
    
    @staticmethod
    def _load_template(purpose: str) -> str:
        """加载邮件模板"""
        template_path = config.TEMPLATE_DIR / "verification.html"
        if template_path.exists():
            return template_path.read_text(encoding="utf-8")
        
        # 默认模板
        return """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Microsoft YaHei', 'Noto Serif SC', serif; background: #f5f3ef; padding: 40px; margin: 0; }
    .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #1a1a1a; font-size: 28px; margin: 0; }
    .header p { color: #888; font-size: 14px; margin-top: 8px; }
    .code-box { background: #f9f7f4; border: 2px dashed #d4c5b0; padding: 24px; text-align: center; margin: 24px 0; border-radius: 4px; }
    .code { font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #1a1a1a; font-family: 'Courier New', monospace; }
    .info { color: #666; font-size: 14px; line-height: 1.8; }
    .warning { color: #c0392b; font-size: 13px; margin-top: 16px; }
    .footer { color: #aaa; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>墨语 Mochat</h1>
      <p>水墨风格AI对话平台</p>
    </div>
    
    <p class="info">您好！</p>
    <p class="info">{{purpose_text}}</p>
    
    <div class="code-box">
      <div class="code">{{code}}</div>
    </div>
    
    <p class="info">验证码有效期 <strong>5 分钟</strong>，请尽快完成验证。</p>
    <p class="warning">如非本人操作，请忽略此邮件。请勿将验证码泄露给他人。</p>
    
    <div class="footer">
      <p>© 2026 墨语 Mochat. 水墨风格AI对话平台</p>
      <p>此邮件由系统自动发送，请勿回复</p>
    </div>
  </div>
</body>
</html>
"""
    
    @staticmethod
    def _get_purpose_text(purpose: str) -> str:
        """获取用途说明文本"""
        texts = {
            config.PURPOSE_REGISTER: "您正在注册 墨语 账号，验证码为：",
            config.PURPOSE_RESET_PASSWORD: "您正在重置 墨语 账号密码，验证码为：",
        }
        return texts.get(purpose, "您的验证码为：")
    
    @classmethod
    async def send_verification_email(
        cls,
        to_email: str,
        code: str,
        purpose: str
    ) -> tuple[bool, Optional[str]]:
        """
        发送验证码邮件
        
        Args:
            to_email: 收件邮箱
            code: 验证码
            purpose: 用途 (register/reset_password)
            
        Returns:
            (success, error_message)
        """
        if not config.RESEND_API_KEY:
            return False, "邮件服务未配置"
        
        try:
            # 设置API密钥
            resend.api_key = config.RESEND_API_KEY
            
            # 加载并渲染模板
            template = cls._load_template(purpose)
            html_content = template.replace("{{code}}", code)
            html_content = html_content.replace("{{purpose_text}}", cls._get_purpose_text(purpose))
            
            # 获取邮件主题
            subject = config.EMAIL_SUBJECTS.get(purpose, "【墨语】您的验证码")
            
            # 发送邮件
            params = {
                "from": f"墨语 Mochat <{config.FROM_EMAIL}>",
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            }
            
            result = resend.Emails.send(params)
            
            if result and result.get("id"):
                return True, None
            else:
                return False, "邮件发送失败"
                
        except Exception as e:
            return False, f"邮件发送异常: {str(e)}"


# 导出服务实例
email_service = EmailService()
