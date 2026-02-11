/**
 * 版本更新弹窗组件
 */
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, CheckCircle, ChevronDown } from 'lucide-react'
import { useState, useMemo, type MouseEvent } from 'react'
import type { VersionInfo, VersionHistoryItem } from './types'

interface VersionModalProps {
  versionInfo: VersionInfo | null
  onClose: () => void
}

// 判断是否为小版本（v1.x.y 格式）
function isMinorVersion(version: string): boolean {
  // 匹配 v1.x.y 格式（三段式版本号）
  return /^v\d+\.\d+\.\d+/.test(version)
}

// 获取大版本号（v1.x.y -> v1.x）
function getMajorVersion(version: string): string {
  const match = version.match(/^(v\d+\.\d+)/)
  return match ? match[1] : version
}

// 将版本列表分组为大版本和其下的小版本
interface VersionGroup {
  major: VersionHistoryItem
  minors: VersionHistoryItem[]
}

function groupVersions(versions: VersionHistoryItem[]): VersionGroup[] {
  const groups: VersionGroup[] = []
  const majorMap = new Map<string, VersionGroup>()

  for (const item of versions) {
    if (isMinorVersion(item.version)) {
      // 小版本：添加到对应大版本下
      const majorKey = getMajorVersion(item.version)
      const group = majorMap.get(majorKey)
      if (group) {
        group.minors.push(item)
      } else {
        // 如果还没有对应的大版本，创建一个虚拟的
        const newGroup: VersionGroup = {
          major: { version: majorKey, description: '' },
          minors: [item]
        }
        majorMap.set(majorKey, newGroup)
        groups.push(newGroup)
      }
    } else {
      // 大版本
      const existing = majorMap.get(item.version)
      if (existing) {
        // 更新已存在的组
        existing.major = item
      } else {
        const newGroup: VersionGroup = { major: item, minors: [] }
        majorMap.set(item.version, newGroup)
        groups.push(newGroup)
      }
    }
  }

  return groups
}

export function VersionModal({ versionInfo, onClose }: VersionModalProps) {
  // 记录展开的大版本
  const [expandedMajors, setExpandedMajors] = useState<Set<string>>(new Set())

  // 分组后的版本列表
  const versionGroups = useMemo(() => {
    if (!versionInfo) return []
    return groupVersions(versionInfo.version_history).reverse()
  }, [versionInfo])

  // 当前版本所属的大版本（默认展开）
  const currentMajor = versionInfo ? getMajorVersion(versionInfo.current_version) : ''

  // 切换展开/收起
  const toggleExpand = (majorVersion: string) => {
    setExpandedMajors((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(majorVersion)) {
        next.delete(majorVersion)
      } else {
        next.add(majorVersion)
      }
      return next
    })
  }

  // 判断是否展开
  const isExpanded = (majorVersion: string) => {
    return expandedMajors.has(majorVersion) || majorVersion === currentMajor
  }

  if (!versionInfo) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-1/2 bg-paper-white rounded-sm shadow-2xl overflow-hidden"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          {/* 头部装饰条 */}
          <div className="h-2 bg-gradient-to-r from-cyan-ink via-ink-black to-vermilion" />

          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-ink-faint hover:text-ink-black transition-colors"
          >
            <X size={20} />
          </button>

          {/* 标题区 */}
          <div className="px-6 pt-6 pb-4 border-b border-paper-aged">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-ink to-ink-black rounded-full">
                <Sparkles size={24} className="text-paper-white" />
              </div>
              <div>
                <h2 className="text-xl font-title text-ink-black">版本更新</h2>
                <p className="text-sm text-ink-faint">
                  当前版本：<span className="text-cyan-ink font-medium">{versionInfo.current_version}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 内容区 */}
          <div className="px-6 py-4 max-h-80 overflow-y-auto custom-scrollbar">
            <div className="space-y-3">
              {versionGroups.map((group: VersionGroup, groupIndex: number) => {
                const isCurrent = group.major.version === versionInfo.current_version || 
                  group.minors.some((m: VersionHistoryItem) => m.version === versionInfo.current_version)
                const hasMinors = group.minors.length > 0
                const expanded = isExpanded(group.major.version)

                return (
                  <motion.div
                    key={group.major.version}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: groupIndex * 0.08 }}
                  >
                    {/* 大版本 */}
                    <div
                      className={`
                        flex gap-3 p-3 rounded-sm cursor-pointer transition-colors
                        ${isCurrent
                          ? 'bg-cyan-ink/10 border border-cyan-ink/30'
                          : 'bg-paper-cream/50 hover:bg-paper-cream'
                        }
                      `}
                      onClick={() => hasMinors && toggleExpand(group.major.version)}
                    >
                      <div className="flex-shrink-0">
                        <div className={`
                          w-14 h-6 flex items-center justify-center rounded-sm text-xs font-bold
                          ${isCurrent
                            ? 'bg-cyan-ink text-paper-white'
                            : 'bg-ink-black/80 text-paper-white'
                          }
                        `}>
                          {group.major.version}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {group.major.description && (
                          <p className="text-sm text-ink-black leading-relaxed">
                            {group.major.description}
                          </p>
                        )}
                        {group.major.version === versionInfo.current_version && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-ink">
                            <CheckCircle size={12} />
                            最新版本
                          </span>
                        )}
                      </div>
                      {hasMinors && (
                        <div className="flex-shrink-0 self-center">
                          <ChevronDown 
                            size={16} 
                            className={`text-ink-faint transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      )}
                    </div>

                    {/* 小版本列表（缩进显示） */}
                    <AnimatePresence>
                      {hasMinors && expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-6 mt-2 space-y-2 border-l-2 border-ink-faint/30 pl-4">
                            {group.minors.map((minor: VersionHistoryItem, minorIndex: number) => {
                              const isMinorCurrent = minor.version === versionInfo.current_version

                              return (
                                <motion.div
                                  key={minor.version}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: minorIndex * 0.05 }}
                                  className={`
                                    flex gap-3 p-2 rounded-sm
                                    ${isMinorCurrent
                                      ? 'bg-cyan-ink/5 border border-cyan-ink/20'
                                      : 'bg-paper-aged/30'
                                    }
                                  `}
                                >
                                  <div className="flex-shrink-0">
                                    <div className={`
                                      w-14 h-5 flex items-center justify-center rounded-sm text-xs
                                      ${isMinorCurrent
                                        ? 'bg-cyan-ink/80 text-paper-white'
                                        : 'bg-ink-faint/30 text-ink-medium'
                                      }
                                    `}>
                                      {minor.version}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-ink-medium leading-relaxed">
                                      {minor.description}
                                    </p>
                                    {isMinorCurrent && (
                                      <span className="inline-flex items-center gap-1 mt-0.5 text-xs text-cyan-ink">
                                        <CheckCircle size={10} />
                                        最新版本
                                      </span>
                                    )}
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* 底部 */}
          <div className="px-6 py-4 bg-paper-cream/50 border-t border-paper-aged">
            <motion.button
              onClick={onClose}
              className="w-full py-3 bg-ink-black text-paper-white rounded-sm font-medium hover:bg-ink-dark transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              我知道了
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default VersionModal
