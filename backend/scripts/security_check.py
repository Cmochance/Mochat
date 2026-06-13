#!/usr/bin/env python3
"""
Mochat 部署安全检查脚本

在部署到生产环境前运行此脚本，检查所有安全配置项是否合规。

用法:
  python backend/scripts/security_check.py
"""

import os
import re
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.security import validate_secret_key_strength
from app.core.cors_validation import validate_cors_origins


_INSECURE_SECRET_KEYS = frozenset({
    "your-super-secret-key-change-this-in-production",
    "secret",
    "change-me",
    "changeme",
    "mochat-secret-key-change-this-in-production",
})


def check_secret_key() -> tuple[bool, str]:
    """检查 SECRET_KEY 是否安全"""
    if settings.SECRET_KEY in _INSECURE_SECRET_KEYS:
        return False, f"使用了不安全的默认密钥: {settings.SECRET_KEY[:15]}..."

    is_valid, msg = validate_secret_key_strength(settings.SECRET_KEY)
    if not is_valid:
        return False, f"密钥强度不足: {msg}"

    return True, "密钥强度验证通过"


def check_database() -> tuple[bool, str]:
    """检查数据库配置"""
    if "sqlite" in settings.DATABASE_URL.lower() and not settings.DEBUG:
        return False, "生产环境不应使用 SQLite，请切换到 PostgreSQL"
    return True, "数据库配置合理"


def check_cors() -> tuple[bool, str]:
    """检查 CORS 配置"""
    origins = settings.cors_origins_list

    if not origins:
        return False, "CORS_ORIGINS 未配置"

    valid, warnings = validate_cors_origins(origins, settings.DEBUG)

    if not valid:
        return False, "没有有效的 CORS 来源"

    if warnings:
        warning_text = "; ".join(warnings)
        if settings.DEBUG:
            return True, f"有效但存在警告（开发模式可接受）: {warning_text}"
        else:
            return False, warning_text

    return True, f"配置了 {len(valid)} 个有效来源"


def check_debug_mode() -> tuple[bool, str]:
    """检查调试模式"""
    if settings.DEBUG:
        return False, "生产环境必须设置 DEBUG=false"
    return True, "调试模式已关闭"


def check_cookie_security() -> tuple[bool, str]:
    """检查 Cookie 安全配置"""
    issues = []

    if not settings.COOKIE_SECURE and not settings.DEBUG:
        issues.append("COOKIE_SECURE=false，Cookie 可能通过 HTTP 传输")

    if settings.COOKIE_SAMESITE == "none" and not settings.COOKIE_SECURE:
        issues.append("SameSite=none 需要 COOKIE_SECURE=true")

    if issues:
        return False, "; ".join(issues)

    return True, f"SameSite={settings.COOKIE_SAMESITE}, Secure={'自动（开发模式）' if settings.DEBUG else settings.COOKIE_SECURE}"


def check_ai_config() -> tuple[bool, str]:
    """检查 AI 配置"""
    if not settings.AI_API_KEY:
        return False, "AI_API_KEY 未配置"
    return True, "AI_API_KEY 已配置"


def check_env_file() -> tuple[bool, str]:
    """检查 .env 文件是否存在且安全"""
    env_path = settings.Config.env_file

    if not os.path.exists(env_path):
        return False, f".env 文件不存在: {env_path}"

    # 检查 .gitignore 中是否包含 .env
    gitignore_path = os.path.join(os.path.dirname(os.path.dirname(env_path)), ".gitignore")
    if os.path.exists(gitignore_path):
        with open(gitignore_path, "r") as f:
            gitignore_content = f.read()
        if ".env" not in gitignore_content:
            return False, ".env 未在 .gitignore 中，可能被提交到 Git"

    return True, ".env 文件存在且在 .gitignore 中"


def run_security_check():
    """运行所有安全检查"""
    checks = [
        ("SECRET_KEY 安全性", check_secret_key),
        ("数据库配置", check_database),
        ("CORS 配置", check_cors),
        ("调试模式", check_debug_mode),
        ("Cookie 安全", check_cookie_security),
        ("AI 配置", check_ai_config),
        (".env 文件", check_env_file),
    ]

    print()
    print("=" * 60)
    print("🔍 Mochat 部署安全检查")
    print("=" * 60)
    print(f"  环境: {'开发' if settings.DEBUG else '生产'}")
    print(f"  数据库: {'SQLite' if 'sqlite' in settings.DATABASE_URL.lower() else 'PostgreSQL'}")
    print(f"  认证: {settings.AUTH_PROVIDER}")
    print("=" * 60)
    print()

    all_passed = True
    results = []

    for name, check_fn in checks:
        try:
            passed, message = check_fn()
        except Exception as e:
            passed = False
            message = f"检查出错: {e}"

        status_icon = "✅" if passed else "❌"
        results.append((name, passed, message))
        print(f"  {status_icon} {name}: {message}")

        if not passed:
            all_passed = False

    print()

    if all_passed:
        print("🎉 所有安全检查通过！可以部署到生产环境。")
        return 0
    else:
        failed_count = sum(1 for _, p, _ in results if not p)
        print(f"⚠️  {failed_count} 项检查未通过，请修复后再部署。")
        return 1


if __name__ == "__main__":
    sys.exit(run_security_check())
