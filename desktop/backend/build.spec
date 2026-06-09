# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置

将 launcher.py + 所有后端依赖 + pandoc 打包为单一可执行文件。

用法：
  pyinstaller desktop/backend/build.spec
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(SPECPATH).parent.parent  # mochat/
BACKEND_DIR = PROJECT_ROOT / "backend"
MODULES_DIR = PROJECT_ROOT / "modules"
DESKTOP_BACKEND = Path(SPECPATH)

# 收集所有 Python 源码路径
datas = []
hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "sqlalchemy",
    "aiosqlite",
    "asyncpg",
    "pydantic",
    "pydantic_settings",
    "jose",
    "passlib",
    "bcrypt",
    "httpx",
    "openai",
    "dotenv",
    "multipart",
    "resend",
    "boto3",
    "botocore",
]

a = Analysis(
    [str(DESKTOP_BACKEND / "launcher.py")],
    pathex=[
        str(DESKTOP_BACKEND),
        str(BACKEND_DIR),
        str(MODULES_DIR / "uppic" / "backend"),
        str(MODULES_DIR / "upword" / "backend"),
        str(MODULES_DIR / "upgrade" / "backend"),
        str(MODULES_DIR / "picgenerate" / "backend"),
        str(MODULES_DIR / "pptgen" / "backend"),
    ],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "scipy", "pandas"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="mochat-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,       # 需要 stdout 输出 READY 信号
    disable_windowed_traceback=False,
)
