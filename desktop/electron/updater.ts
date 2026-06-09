/**
 * 自动更新管理
 *
 * 使用 electron-updater 从 GitHub Releases 检查并下载更新。
 */
import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import * as log from 'electron-log'

let mainWindow: BrowserWindow | null = null

/**
 * 初始化自动更新
 */
export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  // 配置日志
  autoUpdater.logger = log

  // 不自动下载，让用户确认
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 检查更新
  autoUpdater.checkForUpdates().catch((err) => {
    log.error('Failed to check for updates:', err)
  })

  // 有可用更新
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: info.version })
    }

    // 询问用户是否下载
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: '更新可用',
        message: `Mochat ${info.version} 可用，是否下载更新？`,
        buttons: ['下载', '稍后'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
  })

  // 下载进度（可选：发送到渲染进程显示进度条）
  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${Math.round(progress.percent)}%`)
  })

  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-ready', { version: info.version })
    }

    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: '更新已就绪',
        message: '更新已下载完成，重启应用以应用更新。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  // 错误处理
  autoUpdater.on('error', (err) => {
    log.error('Auto updater error:', err)
  })
}

/**
 * 手动触发更新安装（从 IPC 调用）
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
