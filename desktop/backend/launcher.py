"""
Mochat 桌面端后端编排器

单一进程内并发启动 6 个 FastAPI 服务：
  主后端、uppic、upword、upgrade、picgenerate、pptgen

用法：
  python launcher.py --base-port 19527 --db-path ./mochat.db --env-file ./.env
"""
import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path

import uvicorn

from ports import get_port, get_all_ports

logger = logging.getLogger("mochat-launcher")
logging.basicConfig(
    level=logging.INFO,
    format="[launcher] %(asctime)s %(levelname)s %(message)s",
)

# ---------------------------------------------------------------------------
# 路径解析：项目根目录（mochat/）
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent          # desktop/backend/
DESKTOP_DIR = HERE.parent                       # desktop/
PROJECT_ROOT = DESKTOP_DIR.parent              # mochat/
BACKEND_DIR = PROJECT_ROOT / "backend"
MODULES_DIR = PROJECT_ROOT / "modules"

# ---------------------------------------------------------------------------
# 服务定义：(name, module_path, factory)
# ---------------------------------------------------------------------------


def _import_main_backend():
    """导入主后端 app"""
    sys.path.insert(0, str(BACKEND_DIR))
    from app.main import app
    return app


def _import_module_app(module_name: str):
    """导入模块 app（各模块互相隔离，不修改原代码）"""
    mod_dir = MODULES_DIR / module_name / "backend"
    mod_dir_str = str(mod_dir)

    # 临时将模块目录插入 sys.path 前端，确保该模块的 config.py 等
    # 能被正确找到，导入完成后恢复，避免模块间互相干扰
    original_path = sys.path.copy()
    sys.path.insert(0, mod_dir_str)
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            f"mochat_mod_{module_name}", str(mod_dir / "main.py")
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules[f"mochat_mod_{module_name}"] = mod
        spec.loader.exec_module(mod)
        return mod.app
    finally:
        sys.path = original_path


SERVICE_IMPORTERS = {
    "backend": _import_main_backend,
    "uppic": lambda: _import_module_app("uppic"),
    "upword": lambda: _import_module_app("upword"),
    "upgrade": lambda: _import_module_app("upgrade"),
    "picgenerate": lambda: _import_module_app("picgenerate"),
    "pptgen": lambda: _import_module_app("pptgen"),
}

# ---------------------------------------------------------------------------
# 环境变量注入
# ---------------------------------------------------------------------------


def setup_environment(base_port: int, db_path: str, env_file: str):
    """在启动服务前设置所有必要的环境变量"""
    ports = get_all_ports(base_port)

    # 数据库
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"

    # CORS：桌面端只在本地运行，允许所有来源（JWT 通过 header 传递，不依赖 cookie）
    os.environ["CORS_ORIGINS"] = "*"
    os.environ["PICGEN_CORS_ORIGINS"] = "*"
    os.environ["PPTGEN_CORS_ORIGINS"] = "*"
    os.environ["UPGRADE_CORS_ORIGINS"] = "*"

    # 内部服务地址（主后端转发用）
    os.environ["PICGEN_INTERNAL_URL"] = f"http://127.0.0.1:{ports['picgenerate']}"
    os.environ["PPTGEN_INTERNAL_URL"] = f"http://127.0.0.1:{ports['pptgen']}"
    os.environ["UPWORD_INTERNAL_URL"] = f"http://127.0.0.1:{ports['upword']}"

    # upgrade 模块回调主后端地址
    os.environ["MAIN_BACKEND_URL"] = f"http://127.0.0.1:{ports['backend']}"

    # 模块端口覆盖
    os.environ["PICGEN_PORT"] = str(ports["picgenerate"])
    os.environ["PPTGEN_PORT"] = str(ports["pptgen"])
    os.environ["UPPIC_PORT"] = str(ports["uppic"])
    os.environ["UPWORD_PORT"] = str(ports["upword"])
    os.environ["UPGRADE_PORT"] = str(ports["upgrade"])

    # 加载用户 .env 文件（AI API Key 等）
    if os.path.isfile(env_file):
        from dotenv import load_dotenv
        load_dotenv(env_file, override=False)  # 不覆盖已注入的桌面端变量
        logger.info(f"Loaded env file: {env_file}")
    else:
        logger.warning(f"Env file not found: {env_file}")


# ---------------------------------------------------------------------------
# 并发服务运行
# ---------------------------------------------------------------------------

servers: list[uvicorn.Server] = []


async def run_server(name: str, app, host: str, port: int):
    """启动单个 uvicorn 服务（无阻塞）"""
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    servers.append(server)
    logger.info(f"Starting {name} on {host}:{port}")
    await server.serve()


async def main(base_port: int, db_path: str, env_file: str, ready_file: str):
    # 注入环境变量
    setup_environment(base_port, db_path, env_file)
    ports = get_all_ports(base_port)

    # 导入所有 app
    apps = {}
    for name, importer in SERVICE_IMPORTERS.items():
        try:
            apps[name] = importer()
            logger.info(f"Imported {name} app")
        except Exception as e:
            logger.error(f"Failed to import {name}: {e}")
            raise

    # 写入就绪文件，告知 Electron 各服务端口
    ready_data = {
        "ready": True,
        "ports": ports,
        "db_path": db_path,
    }
    Path(ready_file).write_text(json.dumps(ready_data), encoding="utf-8")
    logger.info(f"Ready file written: {ready_file}")
    # 同时输出到 stdout 供 Electron 监听
    print(f"READY:{json.dumps(ready_data)}", flush=True)

    # 并发启动所有服务
    tasks = []
    for name, app in apps.items():
        port = ports[name]
        tasks.append(asyncio.create_task(run_server(name, app, "127.0.0.1", port)))

    # 等待所有服务（正常情况下不会结束，除非收到停止信号）
    await asyncio.gather(*tasks)


def shutdown(sig, frame):
    """收到 SIGTERM/SIGINT 时优雅关闭所有服务"""
    logger.info(f"Received signal {sig}, shutting down...")
    for srv in servers:
        srv.should_exit = True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mochat Desktop Backend Launcher")
    parser.add_argument("--base-port", type=int, default=19527)
    parser.add_argument("--db-path", type=str, default="./mochat.db")
    parser.add_argument("--env-file", type=str, default="./.env")
    parser.add_argument("--ready-file", type=str, default="./sidecar-ready.json")
    args = parser.parse_args()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    asyncio.run(main(args.base_port, args.db_path, args.env_file, args.ready_file))
