"""
Mochat 桌面端端口分配

所有服务端口基于 base_port 偏移计算，避免冲突。
默认 base_port=19527，Electron 侧可在冲突时递增。
"""

DEFAULT_BASE_PORT = 19527

# 服务端口偏移
PORT_OFFSETS = {
    "backend": 0,       # 主后端 API
    "uppic": 1,         # 图片上传服务
    "upword": 2,        # 文档上传解析服务
    "upgrade": 3,       # 版本更新通知服务
    "picgenerate": 4,   # AI 图像生成服务
    "pptgen": 5,        # PPT 生成服务
}

# 服务名到前端调用路径的映射
# uppic/upword/upgrade 需要前端直连
# picgenerate/pptgen 通过主后端转发，前端不直连
FRONTEND_DIRECT_SERVICES = {"uppic", "upword", "upgrade"}


def get_port(base_port: int, service: str) -> int:
    """获取指定服务的端口号"""
    offset = PORT_OFFSETS.get(service)
    if offset is None:
        raise ValueError(f"Unknown service: {service}")
    return base_port + offset


def get_all_ports(base_port: int) -> dict[str, int]:
    """获取所有服务的端口号"""
    return {name: base_port + offset for name, offset in PORT_OFFSETS.items()}
