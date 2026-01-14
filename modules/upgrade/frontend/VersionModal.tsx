/**
 * 版本更新弹窗组件
 */
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, CheckCircle } from 'lucide-react'
import type { VersionInfo } from './types'

interface VersionModalProps {
  versionInfo: VersionInfo | null
  onClose: () => void
}

export function VersionModal({ versionInfo, onClose }: VersionModalProps) {
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
          className="relative w-full max-w-lg mx-4 bg-paper-white rounded-sm shadow-2xl overflow-hidden"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
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
          <div className="px-6 py-4 max-h-80 overflow-y-auto">
            <div className="space-y-4">
              {versionInfo.version_history.slice().reverse().map((item, index) => (
                <motion.div
                  key={item.version}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    flex gap-4 p-3 rounded-sm
                    ${item.version === versionInfo.current_version
                      ? 'bg-cyan-ink/10 border border-cyan-ink/30'
                      : 'bg-paper-cream/50'
                    }
                  `}
                >
                  <div className="flex-shrink-0">
                    <div className={`
                      w-12 h-6 flex items-center justify-center rounded-sm text-xs font-medium
                      ${item.version === versionInfo.current_version
                        ? 'bg-cyan-ink text-paper-white'
                        : 'bg-ink-faint/20 text-ink-medium'
                      }
                    `}>
                      {item.version}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-ink-black leading-relaxed">
                      {item.description}
                    </p>
                    {item.version === versionInfo.current_version && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-ink">
                        <CheckCircle size={12} />
                        最新版本
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
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
