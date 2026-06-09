/**
 * 系统托盘管理
 */
import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import * as path from 'path'

let tray: Tray | null = null

/**
 * 创建系统托盘
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  // 使用应用图标
  const isDev = !app.isPackaged
  const iconPath = isDev
    ? path.join(__dirname, '..', 'resources', 'tray-icon.png')
    : path.join(process.resourcesPath, 'tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Mochat')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: '退出 Mochat',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return tray
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
