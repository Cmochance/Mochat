/**
 * Mochat 桌面端 - Electron 主进程
 *
 * 职责：
 * - 创建并管理 BrowserWindow
 * - 启动 Python 后端 sidecar
 * - 注册 IPC handler（安全存储、端口查询、窗口控制）
 * - 系统托盘、全局快捷键、自动更新
 */
import { app, BrowserWindow, ipcMain, globalShortcut, safeStorage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { startSidecar, stopSidecar, getReadyInfo, type SidecarPorts } from './sidecar'
import { createTray, destroyTray } from './tray'
import { initUpdater, installUpdate } from './updater'

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null
const isDev = !app.isPackaged

// 安全存储文件路径
function getSecureStorePath(): string {
  return path.join(app.getPath('userData'), 'secure-storage.json')
}

// ---------------------------------------------------------------------------
// 安全存储实现
// ---------------------------------------------------------------------------
function loadSecureData(): Record<string, string> {
  const filePath = getSecureStorePath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const encrypted = fs.readFileSync(filePath)
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(encrypted)
      return JSON.parse(decrypted)
    }
    return JSON.parse(encrypted.toString('utf-8'))
  } catch {
    return {}
  }
}

function saveSecureData(data: Record<string, string>): void {
  const filePath = getSecureStorePath()
  const json = JSON.stringify(data)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json)
    fs.writeFileSync(filePath, encrypted)
  } else {
    fs.writeFileSync(filePath, json, 'utf-8')
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers(): void {
  // 后端地址查询
  ipcMain.on('get-api-base-url', (event) => {
    const info = getReadyInfo()
    if (info) {
      event.returnValue = `http://127.0.0.1:${info.ports.backend}/api`
    } else {
      event.returnValue = '/api'
    }
  })

  ipcMain.on('get-module-base-url', (event, module: string) => {
    const info = getReadyInfo()
    if (info && module in info.ports) {
      event.returnValue = `http://127.0.0.1:${info.ports[module as keyof SidecarPorts]}`
    } else {
      event.returnValue = `/${module}`
    }
  })

  // 安全存储
  ipcMain.handle('secure-store:get', (_event, key: string) => {
    const data = loadSecureData()
    return data[key] ?? null
  })

  ipcMain.handle('secure-store:set', (_event, key: string, value: string) => {
    const data = loadSecureData()
    data[key] = value
    saveSecureData(data)
  })

  ipcMain.handle('secure-store:delete', (_event, key: string) => {
    const data = loadSecureData()
    delete data[key]
    saveSecureData(data)
  })

  // 窗口控制
  ipcMain.handle('minimize-to-tray', () => {
    if (mainWindow) {
      mainWindow.hide()
    }
  })

  // 更新
  ipcMain.handle('install-update', () => {
    installUpdate()
  })
}

// ---------------------------------------------------------------------------
// 窗口创建
// ---------------------------------------------------------------------------
async function createWindow(): Promise<BrowserWindow> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Mochat',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // macOS 风格
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,  // 等 ready-to-show 后再显示，避免白屏闪烁
  })

  // 优雅显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭时最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 加载页面
  if (isDev) {
    // 开发模式：连接 Vite dev server
    mainWindow.loadURL('http://localhost:3721')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的前端文件
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }

  return mainWindow
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

// 标记是否正在退出（用于区分关闭窗口和退出应用）
app.on('before-quit', () => {
  ;(app as any).isQuitting = true
})

app.whenReady().then(async () => {
  // 1. 注册 IPC handlers
  registerIpcHandlers()

  // 2. 启动 sidecar
  try {
    const info = await startSidecar()
    console.log('[main] Sidecar ready, ports:', info.ports)
  } catch (err) {
    console.error('[main] Failed to start sidecar:', err)
    // 仍然创建窗口，让用户看到错误
  }

  // 3. 创建窗口
  const win = await createWindow()

  // 4. 系统托盘
  createTray(win)

  // 5. 全局快捷键
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (win.isVisible()) {
      win.focus()
    } else {
      win.show()
      win.focus()
    }
  })

  // 6. 自动更新（仅生产模式）
  if (!isDev) {
    initUpdater(win)
  }
})

app.on('window-all-closed', () => {
  // macOS 不在关闭所有窗口时退出
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // macOS：点击 dock 图标时重新创建窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else if (mainWindow) {
    mainWindow.show()
  }
})

app.on('will-quit', () => {
  // 注销全局快捷键
  globalShortcut.unregisterAll()
  // 停止 sidecar
  stopSidecar()
  // 销毁托盘
  destroyTray()
})
