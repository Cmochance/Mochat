/**
 * 版本检查 Hook
 */
import { useState, useEffect, useCallback } from 'react'
import type { VersionInfo, UpgradeConfig } from './types'

const DEFAULT_CONFIG: UpgradeConfig = {
  apiBasePath: '/upgrade',
}

export function useVersion(config?: UpgradeConfig) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  // 获取版本信息
  const fetchVersionInfo = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${mergedConfig.apiBasePath}/api/version`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('获取版本信息失败')
      }

      const data: VersionInfo = await response.json()
      setVersionInfo(data)
      
      // 如果有新版本，显示弹窗
      if (data.has_new_version) {
        setShowModal(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      setError(message)
      console.error('[Upgrade] 获取版本信息失败:', message)
    } finally {
      setLoading(false)
    }
  }, [mergedConfig.apiBasePath])

  // 确认已阅读版本
  const acknowledgeVersion = useCallback(async (version: string) => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      await fetch(`${mergedConfig.apiBasePath}/api/version/ack`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version }),
      })
    } catch (err) {
      console.error('[Upgrade] 确认版本失败:', err)
    }
  }, [mergedConfig.apiBasePath])

  // 关闭弹窗并确认版本
  const closeModal = useCallback(async () => {
    if (versionInfo) {
      await acknowledgeVersion(versionInfo.current_version)
    }
    setShowModal(false)
  }, [versionInfo, acknowledgeVersion])

  // 组件挂载时获取版本信息
  useEffect(() => {
    fetchVersionInfo()
  }, [fetchVersionInfo])

  return {
    versionInfo,
    loading,
    error,
    showModal,
    closeModal,
    refetch: fetchVersionInfo,
  }
}

// 获取当前版本号（无需认证）
export async function getCurrentVersion(apiBasePath = '/upgrade'): Promise<string> {
  try {
    const response = await fetch(`${apiBasePath}/api/version/current`)
    if (response.ok) {
      const data = await response.json()
      return data.version
    }
  } catch (err) {
    console.error('[Upgrade] 获取当前版本失败:', err)
  }
  return 'v1.5' // 默认版本
}

// 获取完整版本信息（用于手动触发弹窗）
export async function getVersionInfo(apiBasePath = '/upgrade'): Promise<VersionInfo> {
  const token = localStorage.getItem('token')
  
  const response = await fetch(`${apiBasePath}/api/version`, {
    headers: token ? {
      'Authorization': `Bearer ${token}`,
    } : {},
  })

  if (!response.ok) {
    throw new Error('获取版本信息失败')
  }

  return await response.json()
}
