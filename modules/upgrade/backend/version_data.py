"""
版本历史数据
在此文件中维护版本更新记录
"""

# 当前版本号
CURRENT_VERSION = "v1.5.4"

# 版本历史记录
# 大版本格式: v1.x，小版本格式: v1.x.y
VERSION_HISTORY = [
    {
        "version": "v1.0",
        "description": "搭建网站框架，成功部署并投入使用。"
    },
    {
        "version": "v1.1",
        "description": "添加上传图片功能。"
    },
    {
        "version": "v1.2",
        "description": "风控设置，设置系统提示词掐断和后台添加遗漏违禁词功能。"
    },
    {
        "version": "v1.3",
        "description": "优化公式输出格式问题，添加上传word文档功能。"
    },
    {
        "version": "v1.4",
        "description": "版本更新通知系统、会话/滚动位置记忆、消息分页加载。"
    },
    {
        "version": "v1.4.1",
        "description": "优化对话定位逻辑，添加模型选择功能。"
    },
    {
        "version": "v1.4.2",
        "description": "优化对话框显示，避免对话过长导致页面崩坏。"
    },
    {
        "version": "v1.4.3",
        "description": "添加导出为word文档，优化文档命名逻辑。"
    },
    {
        "version": "v1.5",
        "description": "修复bug并添加生图功能。"
    },
    {
        "version": "v1.5.1",
        "description": "修复对话内容过长导致的布局溢出。"
    },
    {
        "version": "v1.5.2",
        "description": "修复输出内容过长导致长时间无反应的问题，添加流式输出。"
    },
    {
        "version": "v1.5.3",
        "description": "修改定位逻辑，避免向上加载聊天记录时自动下滚。"
    },
    {
        "version": "v1.5.4",
        "description": "添加 AI 绘图模式，集成 picgenerate 模块，支持流式 thinking 输出。"
    },
]
