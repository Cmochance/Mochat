import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface ThinkingBlockProps {
  content: string
  isStreaming?: boolean
  hasContent?: boolean  // 是否已经开始输出正式内容
}

export default function ThinkingBlock({ content, isStreaming = false, hasContent = false }: ThinkingBlockProps) {
  // 流式输出思考内容且没有正式内容时展开，否则折叠
  const [isExpanded, setIsExpanded] = useState(!hasContent && isStreaming)
  const hasAutoCollapsed = useRef(false)  // 标记是否已自动折叠过
  
  // 当开始输出正式内容时自动折叠
  useEffect(() => {
    if (hasContent && isStreaming && !hasAutoCollapsed.current) {
      setIsExpanded(false)
      hasAutoCollapsed.current = true
    }
  }, [hasContent, isStreaming])
  
  // 当开始新的流式输出时重置状态
  useEffect(() => {
    if (isStreaming && !hasContent) {
      setIsExpanded(true)
      hasAutoCollapsed.current = false
    }
  }, [isStreaming, hasContent])

  if (!content) return null

  return (
    <motion.div
      className="mb-3 w-full"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 折叠标题 */}
      <button
        className="flex items-center gap-2 text-cyan-ink hover:text-ink-black transition-colors w-full text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </motion.span>
        <Brain size={16} />
        <span className="text-sm font-medium">
          思考过程
          {isStreaming && (
            <motion.span
              className="ml-2"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              ...
            </motion.span>
          )}
        </span>
      </button>

      {/* 折叠内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-4 bg-paper-cream/50 border-l-4 border-cyan-ink rounded-r-sm">
              <p className="text-sm text-ink-medium whitespace-pre-wrap leading-relaxed">
                {content}
                {isStreaming && (
                  <motion.span
                    className="inline-block w-2 h-4 bg-cyan-ink ml-1"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 折叠时的预览 */}
      {!isExpanded && (
        <motion.div
          className="mt-1 text-xs text-ink-faint truncate max-w-md pl-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
        >
          {content.slice(0, 50)}...
        </motion.div>
      )}
    </motion.div>
  )
}
