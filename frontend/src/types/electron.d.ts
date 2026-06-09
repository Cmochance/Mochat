/**
 * Electron preload 脚本注入的 API 类型声明
 *
 * 仅在 Electron 桌面环境中可用。
 * Web 模式下 window.electronAPI 为 undefined，可通过 isDesktop() 检测。
 */

interface ElectronSecureStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

interface ElectronAPI {
  /** 获取主后端 API base URL，如 'http://127.0.0.1:19527/api' */
  getApiBaseUrl(): string

  /** 获取模块服务 base URL，如 'http://127.0.0.1:19528' */
  getModuleBaseUrl(module: 'uppic' | 'upword' | 'upgrade'): string

  /** 系统级安全存储（macOS Keychain / Windows Credential Manager） */
  secureStore: ElectronSecureStore

  /** 最小化到系统托盘 */
  minimizeToTray(): void

  /** 是否运行在桌面环境中 */
  isDesktop: true

  /** 监听更新可用事件 */
  onUpdateAvailable(callback: (info: { version: string }) => void): void

  /** 监听更新下载完成事件 */
  onUpdateReady(callback: (info: { version: string }) => void): void

  /** 安装更新并重启 */
  installUpdate(): void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
