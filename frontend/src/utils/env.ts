/**
 * 运行环境检测工具
 *
 * 桌面模式（Electron）下 window.electronAPI 由 preload 脚本注入。
 * Web 模式下所有函数返回浏览器端的默认值，行为零变化。
 */

/** 是否运行在 Electron 桌面环境中 */
export const isDesktop = (): boolean => {
  try {
    return !!(window as any).electronAPI
  } catch {
    return false
  }
}

/**
 * 获取主后端 API 的 base URL
 * - Web 模式: '/api'（由 Vite proxy / Nginx 转发）
 * - 桌面模式: 'http://127.0.0.1:<port>/api'
 */
export const getApiBaseUrl = (): string => {
  if (isDesktop()) {
    return (window as any).electronAPI.getApiBaseUrl()
  }
  return '/api'
}

/**
 * 获取模块服务的 base URL（uppic / upword / upgrade）
 * - Web 模式: '/<module>'（由 Vite proxy / Nginx 转发）
 * - 桌面模式: 'http://127.0.0.1:<port>'
 */
export const getModuleBaseUrl = (
  module: 'uppic' | 'upword' | 'upgrade'
): string => {
  if (isDesktop()) {
    return (window as any).electronAPI.getModuleBaseUrl(module)
  }
  return `/${module}`
}
