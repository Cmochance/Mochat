/**
 * Python 后端 Sidecar 管理
 *
 * 负责启动/停止/监控 Python 编排进程（launcher.py）。
 * launcher.py 会并发启动 6 个 FastAPI 服务。
 */
import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as net from 'net'
import * as http from 'http'

const DEFAULT_BASE_PORT = 19527
const MAX_PORT_ATTEMPTS = 10
const HEALTH_CHECK_INTERVAL = 500    // ms
const HEALTH_CHECK_TIMEOUT = 30_000  // 30s
const MAX_RESTARTS = 3

export interface SidecarPorts {
  backend: number
  uppic: number
  upword: number
  upgrade: number
  picgenerate: number
  pptgen: number
}

export interface SidecarReadyInfo {
  ports: SidecarPorts
  dbPath: string
}

let sidecarProcess: ChildProcess | null = null
let restartCount = 0
let currentBasePort = DEFAULT_BASE_PORT
let readyInfo: SidecarReadyInfo | null = null

/**
 * 检查端口是否可用
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '127.0.0.1')
  })
}

/**
 * 查找可用的 base port
 */
async function findAvailablePort(): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = DEFAULT_BASE_PORT + i * 10  // 每次递增 10，留出 6 个服务的余量
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error('无法找到可用端口')
}

/**
 * 等待 sidecar 就绪（通过健康检查）
 */
async function waitForReady(port: number): Promise<boolean> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT
  while (Date.now() < deadline) {
    try {
      const ok = await checkHealth(port)
      if (ok) return true
    } catch {
      // 服务还没启动，继续等
    }
    await sleep(HEALTH_CHECK_INTERVAL)
  }
  return false
}

function checkHealth(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', reject)
    req.setTimeout(2000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 获取 sidecar 可执行文件路径
 */
function getSidecarPath(): string {
  // 开发模式：使用 Python 直接运行 launcher.py
  // 生产模式：使用 PyInstaller 打包的可执行文件
  const isDev = !app.isPackaged

  if (isDev) {
    return path.join(__dirname, '..', 'backend', 'launcher.py')
  }

  // 生产模式：可执行文件在 resources 目录
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(process.resourcesPath, `mochat-server${ext}`)
}

/**
 * 获取用户数据目录下的数据库路径和 env 文件路径
 */
function getPaths() {
  const userData = app.getPath('userData')
  return {
    dbPath: path.join(userData, 'mochat.db'),
    envFile: path.join(userData, '.env'),
    readyFile: path.join(userData, 'sidecar-ready.json'),
  }
}

/**
 * 确保 .env 文件存在（首次启动时生成默认模板）
 */
function ensureEnvFile(envFile: string): void {
  if (!fs.existsSync(envFile)) {
    const template = `# Mochat 桌面端配置
# 请填入你的 AI API Key
AI_API_KEY=your-api-key-here
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4

# 其他配置使用默认值即可
# 完整配置项参考项目根目录的 .env.example
`
    fs.writeFileSync(envFile, template, 'utf-8')
    console.log(`[sidecar] Generated default .env at ${envFile}`)
  }
}

/**
 * 启动 sidecar
 */
export async function startSidecar(): Promise<SidecarReadyInfo> {
  if (readyInfo) return readyInfo

  const sidecarPath = getSidecarPath()
  const { dbPath, envFile, readyFile } = getPaths()
  const isDev = !app.isPackaged

  // 确保 .env 存在
  ensureEnvFile(envFile)

  // 查找可用端口
  currentBasePort = await findAvailablePort()

  console.log(`[sidecar] Starting from ${sidecarPath}`)
  console.log(`[sidecar] Base port: ${currentBasePort}`)
  console.log(`[sidecar] DB path: ${dbPath}`)

  // 构造启动参数
  const args = [
    '--base-port', String(currentBasePort),
    '--db-path', dbPath,
    '--env-file', envFile,
    '--ready-file', readyFile,
  ]

  if (isDev) {
    // 开发模式：用 Python 运行 launcher.py
    sidecarProcess = spawn('python3', [sidecarPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } else {
    // 生产模式：直接运行可执行文件
    sidecarProcess = spawn(sidecarPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  // 监听 stdout，查找 READY 信号
  const readyPromise = new Promise<SidecarReadyInfo>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Sidecar 启动超时'))
    }, HEALTH_CHECK_TIMEOUT)

    sidecarProcess!.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      console.log(`[sidecar:stdout] ${text.trim()}`)

      // 查找 READY 信号
      const match = text.match(/READY:(.+)/)
      if (match) {
        try {
          const info = JSON.parse(match[1])
          readyInfo = {
            ports: info.ports,
            dbPath: info.db_path,
          }
          clearTimeout(timeout)
          resolve(readyInfo)
        } catch (e) {
          console.error('[sidecar] Failed to parse READY info:', e)
        }
      }
    })

    sidecarProcess!.stderr?.on('data', (data: Buffer) => {
      console.error(`[sidecar:stderr] ${data.toString().trim()}`)
    })
  })

  // 监听进程退出
  sidecarProcess.on('exit', (code, signal) => {
    console.log(`[sidecar] Exited with code=${code}, signal=${signal}`)
    sidecarProcess = null
    readyInfo = null

    // 非正常退出且未超过重启次数时自动重启
    if (code !== 0 && code !== null && restartCount < MAX_RESTARTS) {
      restartCount++
      console.log(`[sidecar] Auto-restarting (attempt ${restartCount}/${MAX_RESTARTS})...`)
      setTimeout(() => {
        startSidecar().catch((err) => {
          console.error('[sidecar] Restart failed:', err)
        })
      }, 2000)
    }
  })

  sidecarProcess.on('error', (err) => {
    console.error('[sidecar] Process error:', err)
  })

  return readyPromise
}

/**
 * 停止 sidecar
 */
export function stopSidecar(): void {
  if (sidecarProcess) {
    console.log('[sidecar] Stopping...')
    // 先尝试 SIGTERM 让 Python 优雅关闭
    sidecarProcess.kill('SIGTERM')

    // 如果 5 秒后还没退出，强制 kill
    setTimeout(() => {
      if (sidecarProcess) {
        console.log('[sidecar] Force killing...')
        sidecarProcess.kill('SIGKILL')
        sidecarProcess = null
      }
    }, 5000)
  }
}

/**
 * 获取当前就绪信息
 */
export function getReadyInfo(): SidecarReadyInfo | null {
  return readyInfo
}
