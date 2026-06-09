/**
 * Mochat 桌面端 - Electron 主进程
 *
 * 职责：
 * - 创建并管理 BrowserWindow
 * - 启动 Python 后端 sidecar
 * - 注册 IPC handler（安全存储、端口查询、窗口控制）
 * - 系统托盘、全局快捷键、自动更新
 */
import { app, BrowserWindow, ipcMain, globalShortcut, safeStorage, Notification, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { startSidecar, stopSidecar, getReadyInfo, type SidecarPorts } from './sidecar'
import { createTray, destroyTray } from './tray'
import { initUpdater, installUpdate } from './updater'

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null
const isDev = !app.isPackaged
let isQuitting = false

// 安全存储文件路径
// ---------------------------------------------------------------------------
// 生产模式静态文件服务器
// ---------------------------------------------------------------------------
let frontendServer: http.Server | null = null
let frontendPort = 0

function startFrontendServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const distDir = path.join(process.resourcesPath, 'frontend', 'dist')
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    }

    frontendServer = http.createServer((req, res) => {
      let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url!)
      // SPA fallback：非文件请求返回 index.html
      if (!path.extname(filePath)) {
        filePath = path.join(distDir, 'index.html')
      }
      const ext = path.extname(filePath).toLowerCase()
      const contentType = mimeTypes[ext] || 'application/octet-stream'

      fs.readFile(filePath, (err, content) => {
        if (err) {
          // 404 fallback 到 index.html（SPA 路由）
          fs.readFile(path.join(distDir, 'index.html'), (_err2, fallback) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(fallback)
          })
        } else {
          res.writeHead(200, { 'Content-Type': contentType })
          res.end(content)
        }
      })
    })

    frontendServer.listen(0, '127.0.0.1', () => {
      const addr = frontendServer!.address()
      if (typeof addr === 'object' && addr) {
        frontendPort = addr.port
        resolve(frontendPort)
      } else {
        reject(new Error('Failed to start frontend server'))
      }
    })
  })
}

function getEnvPath(): string {
  return path.join(app.getPath('userData'), '.env')
}

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

  // 首次设置检测
  ipcMain.on('needs-setup', (event) => {
    const envFile = getEnvPath()
    if (!fs.existsSync(envFile)) {
      event.returnValue = true
      return
    }
    const content = fs.readFileSync(envFile, 'utf-8')
    // 检查是否还是占位符值
    const hasPlaceholder = content.includes('your-api-key-here') || !content.includes('AI_API_KEY=')
    event.returnValue = hasPlaceholder
  })

  // 保存设置
  ipcMain.handle('save-setup', async (_event, config: { aiApiKey: string; aiBaseUrl: string; aiModel: string }) => {
    const envFile = getEnvPath()
    const envContent = [
      '# Mochat 桌面端配置',
      `AI_API_KEY=${config.aiApiKey}`,
      `AI_BASE_URL=${config.aiBaseUrl}`,
      `AI_MODEL=${config.aiModel}`,
      '',
      '# 其他配置使用默认值',
      'DEBUG=false',
    ].join('\n')
    fs.writeFileSync(envFile, envContent, 'utf-8')

    // 重启 sidecar 以加载新配置
    await stopSidecar()
    const info = await startSidecar()
    if (mainWindow) {
      mainWindow.webContents.send('setup-complete', info)
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

  // 原生通知
  ipcMain.handle('notify', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body })
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.focus()
        }
      })
      notification.show()
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
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 加载页面
  // 检测是否需要首次设置
  const envFile = getEnvPath()
  const needsSetup = !fs.existsSync(envFile) ||
    fs.readFileSync(envFile, "utf-8").includes("your-api-key-here")
  const setupPath = needsSetup ? "/setup" : ""
  if (isDev) {
    // 开发模式：连接 Vite dev server
    mainWindow.loadURL(`http://localhost:3721${setupPath}`)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：通过本地 HTTP 服务器加载前端（避免 file:// 的 CORS 限制）
    const port = await startFrontendServer()
    mainWindow.loadURL(`http://127.0.0.1:${port}${setupPath}`)
  }

  return mainWindow
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

// 标记是否正在退出（用于区分关闭窗口和退出应用）
app.on('before-quit', () => {
  isQuitting = true
})

// ---------------------------------------------------------------------------
// 深度链接 (mochat://)
// ---------------------------------------------------------------------------
if (process.defaultApp) {
  // 开发模式：注册协议用于调试
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('mochat', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('mochat')
}

let deepLinkUrl: string | null = null

// macOS: 通过 open-url 事件接收
app.on('open-url', (event, url) => {
  event.preventDefault()
  deepLinkUrl = url
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('deep-link', url)
  }
})

// Windows/Linux: 通过 second-instance 事件接收
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // 从命令行参数提取 URL
    const url = commandLine.find((arg) => arg.startsWith('mochat://'))
    if (url) {
      deepLinkUrl = url
      mainWindow?.webContents.send('deep-link', url)
    }
  })
}

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

  // 7. 发送待处理的深度链接
  if (deepLinkUrl) {
    win.webContents.send('deep-link', deepLinkUrl)
    deepLinkUrl = null
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
  stopSidecar().catch(() => {})
  // 销毁托盘
  destroyTray()
  // 关闭前端静态服务器
  if (frontendServer) {
    frontendServer.close()
    frontendServer = null
  }
})
