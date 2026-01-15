/**
 * Upgrade 模块 - 版本更新通知
 * 
 * 使用方式：
 * 
 * ```tsx
 * import { useVersion, VersionModal } from '@upgrade'
 * 
 * function App() {
 *   const { versionInfo, showModal, closeModal } = useVersion()
 *   
 *   return (
 *     <>
 *       {showModal && <VersionModal versionInfo={versionInfo} onClose={closeModal} />}
 *       // ...
 *     </>
 *   )
 * }
 * ```
 */

export { useVersion, getCurrentVersion, getVersionInfo } from './useVersion'
export { VersionModal } from './VersionModal'
export type { VersionInfo, VersionHistoryItem, UpgradeConfig } from './types'
