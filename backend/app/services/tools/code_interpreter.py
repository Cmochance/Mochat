"""
代码解释器工具
允许 AI 助手在沙箱环境中执行 Python 代码。适合进行复杂的数学计算、数据分析、绘制图表等任务。
"""

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from typing import Any, Dict

logger = logging.getLogger(__name__)

# 定义静态生成文件的物理目录和网络 URL 前缀
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_GENERATED_DIR = os.path.join(BACKEND_ROOT, "static", "generated")
os.makedirs(STATIC_GENERATED_DIR, exist_ok=True)

URL_PREFIX = "/api/static/generated/"


def execute_python_code(code: str) -> Dict[str, Any]:
    """
    在沙箱环境中执行 Python 代码并返回 stdout、stderr 以及任何保存的图表。

    Args:
        code: 需要执行的 Python 源代码

    Returns:
        包含执行状态、输出和生成的图片链接的字典
    """
    logger.info("开始执行 Python 代码...")

    # 创建临时工作目录
    with tempfile.TemporaryDirectory() as temp_dir:
        # 代码写入文件
        script_path = os.path.join(temp_dir, "sandbox_script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        # 设置子进程环境变量，强制 matplotlib 使用非交互式 Agg 后端
        env = os.environ.copy()
        env["MPLBACKEND"] = "Agg"

        try:
            # 运行代码，限时 30 秒
            result = subprocess.run(
                [sys.executable, "sandbox_script.py"], cwd=temp_dir, capture_output=True, text=True, env=env, timeout=30
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

        # 扫描临时目录，捕获所有生成的新图片文件
        image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".svg"}
        images = []

        try:
            for filename in os.listdir(temp_dir):
                _, ext = os.path.splitext(filename)
                if ext.lower() in image_extensions:
                    src_path = os.path.join(temp_dir, filename)
                    # 生成唯一的文件名防止冲突
                    unique_filename = f"plot_{uuid.uuid4().hex}{ext}"
                    dest_path = os.path.join(STATIC_GENERATED_DIR, unique_filename)

                    # 复制文件到公开静态目录
                    shutil.copy(src_path, dest_path)

                    # 生成可供前端访问的 URL
                    web_url = f"{URL_PREFIX}{unique_filename}"
                    images.append(web_url)

                    logger.info(f"成功捕获图表: {filename} -> {dest_path}")
        except Exception as e:
            logger.error(f"处理图表文件时出错: {e}")
            stderr += f"\n[Warning: Failed to capture generated images: {str(e)}]"

        # 将生成的图片链接以 Markdown 格式追加到输出中，方便大模型在没有专门解析时也能直接显示
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
