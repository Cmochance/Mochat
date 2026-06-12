"""
代码解释器工具
允许 AI 助手在沙箱环境中执行 Python 代码。适合进行复杂的数学计算、数据分析、绘制图表等任务。

安全说明：当前实现通过子进程 + 临时目录 + 超时限制提供基本隔离。
生产环境建议升级为 Docker 容器级沙箱以获得更强的安全保障。
"""

import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from typing import Any, Dict

logger = logging.getLogger(__name__)

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_GENERATED_DIR = os.path.join(BACKEND_ROOT, "static", "generated")
os.makedirs(STATIC_GENERATED_DIR, exist_ok=True)

URL_PREFIX = "/api/static/generated/"

# 基本安全检查：阻止明显危险的代码模式
_BLOCKED_PATTERNS = [
    r'\bimport\s+os\b',
    r'\bimport\s+subprocess\b',
    r'\bimport\s+shutil\b',
    r'\bfrom\s+os\s+import\b',
    r'\bfrom\s+subprocess\s+import\b',
    r'\bos\.(system|popen|exec|remove|rmdir|makedirs)\s*\(',
    r'\bsubprocess\.(run|Popen|call|check_output)\s*\(',
    r'\bopen\s*\(\s*["\']/',
    r'\b__import__\s*\(',
    r'\beval\s*\(',
    r'\bexec\s*\(',
]


def _check_code_safety(code: str) -> str | None:
    """检查代码是否包含危险模式，返回错误信息或 None"""
    for pattern in _BLOCKED_PATTERNS:
        if re.search(pattern, code):
            return f"代码包含被禁止的操作: {pattern}。沙箱仅允许使用 math, numpy, pandas, matplotlib 等数据分析库。"
    return None


def execute_python_code(code: str) -> Dict[str, Any]:
    """
    在沙箱环境中执行 Python 代码并返回 stdout、stderr 以及任何保存的图表。
    """
    # 安全检查
    safety_error = _check_code_safety(code)
    if safety_error:
        return {
            "stdout": "",
            "stderr": safety_error,
            "exit_code": -1,
            "images": [],
            "result_summary": f"执行被拒绝: {safety_error}",
        }

    logger.info("开始执行 Python 代码...")

    with tempfile.TemporaryDirectory() as temp_dir:
        script_path = os.path.join(temp_dir, "sandbox_script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        # 构建受限环境变量：移除敏感信息
        env = {}
        safe_keys = {"PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "MPLBACKEND"}
        for key, val in os.environ.items():
            if key.upper() in safe_keys or key.startswith("PYTHON"):
                env[key] = val
        env["MPLBACKEND"] = "Agg"
        env["TMPDIR"] = temp_dir

        try:
            result = subprocess.run(
                [sys.executable, "sandbox_script.py"],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env,
                timeout=30,
            )
            stdout = result.stdout
            stderr = result.stderr
            exit_code = result.returncode

        except subprocess.TimeoutExpired as te:
            stdout = te.stdout.decode("utf-8", errors="ignore") if isinstance(te.stdout, bytes) else (te.stdout or "")
            stderr = te.stderr.decode("utf-8", errors="ignore") if isinstance(te.stderr, bytes) else (te.stderr or "")
            stderr += "\n[Error: Execution timed out (limit: 30 seconds)]"
            exit_code = -1
        except Exception as e:
            stdout = ""
            stderr = f"[Error: Failed to execute script: {str(e)}]"
            exit_code = -1

        # 捕获生成的图片
        image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".svg"}
        images = []

        try:
            for filename in os.listdir(temp_dir):
                _, ext = os.path.splitext(filename)
                if ext.lower() in image_extensions:
                    src_path = os.path.join(temp_dir, filename)
                    unique_filename = f"plot_{uuid.uuid4().hex}{ext}"
                    dest_path = os.path.join(STATIC_GENERATED_DIR, unique_filename)
                    shutil.copy(src_path, dest_path)
                    web_url = f"{URL_PREFIX}{unique_filename}"
                    images.append(web_url)
                    logger.info(f"成功捕获图表: {filename} -> {dest_path}")
        except Exception as e:
            logger.error(f"处理图表文件时出错: {e}")
            stderr += f"\n[Warning: Failed to capture generated images: {str(e)}]"

        markdown_images = ""
        if images:
            markdown_images = "\n\n" + "\n".join([f"![Generated Image]({url})" for url in images])

        return {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code,
            "images": images,
            "result_summary": f"执行完毕 (退出码: {exit_code})。{stdout}{markdown_images}"
            if exit_code == 0
            else f"执行失败 (退出码: {exit_code})。{stderr}",
        }


TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "execute_python_code",
        "description": "在沙箱环境中执行 Python 代码。适合进行数学计算、数据分析、绘制图表（如使用 matplotlib/seaborn）等任务。代码需自包含并在控制台打印输出。如果绘制了图表，请务必使用 plt.savefig('文件名.png') 保存到当前目录下，系统会自动捕获并以图片形式呈现。",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "要执行的完整 Python 代码。请确保所有需要的库（如 pandas, matplotlib）均被正确导入，且打印了结果。",
                }
            },
            "required": ["code"],
        },
    },
}
