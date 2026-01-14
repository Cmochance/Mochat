import api from './api'
import type { VersionInfo } from '../types'

export const versionService = {
  /**
   * 获取版本信息
   */
  async getVersionInfo(): Promise<VersionInfo> {
    const response = await api.get<VersionInfo>('/user/version')
    return response.data
  },

  /**
   * 确认已阅读版本更新
   */
  async acknowledgeVersion(version: string): Promise<void> {
    await api.post('/user/version/ack', { version })
  },
}

export default versionService
