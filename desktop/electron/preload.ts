/**
 * Electron 预加载脚本
 *
 * 通过 contextBridge 安全地暴露 API 给渲染进程。
 * 所有 IPC 通信都经过此桥接，避免直接暴露 Node.js API。
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ---- 后端服务地址 ----
  getApiBaseUrl: (): string => ipcRenderer.sendSync('get-api-base-url'),
  getModuleBaseUrl: (module: string): string =>
    ipcRenderer.sendSync('get-module-base-url', module),

  // ---- 安全存储（macOS Keychain / Windows Credential Manager） ----
  secureStore: {
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('secure-store:get', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secure-store:set', key, value),
    delete: (key: string): Promise<void> =>
      ipcRenderer.invoke('secure-store:delete', key),
  },

  // ---- 首次设置 ----
  needsSetup: (): boolean => ipcRenderer.sendSync('needs-setup'),
  saveSetup: (config: { aiApiKey: string; aiBaseUrl: string; aiModel: string }): Promise<void> =>
    ipcRenderer.invoke('save-setup', config),

  // ---- 窗口控制 ----
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),

  // ---- 标记桌面环境 ----
  isDesktop: true,

  // ---- 自动更新 ----
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info))
  },
  onUpdateReady: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-ready', (_event, info) => callback(info))
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
})
