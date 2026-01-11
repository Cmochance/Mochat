import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface ThinkingBlockProps {
  content: string
  isStreaming?: boolean
  hasContent?: boolean  // 是否已有主要内容（用于自动折叠）
}

export default function ThinkingBlock({ 
  content, 
  isStreaming = false,
  hasContent = false 
}: ThinkingBlockProps) {
  // 流式输出时默认展开，有内容后自动折叠
  const [isExpanded, setIsExpanded] = useState(false)
  const [userToggled, setUserToggled] = useState(false)
  const prevHasContentRef = useRef(hasContent)

  // 自动控制展开/折叠逻辑
  useEffect(() => {
    // 如果用户手动切换过，不再自动控制
    if (userToggled) return

    if (isStreaming && !hasContent) {
      // 流式输出 thinking 时，自动展开
      setIsExpanded(true)
    } else if (hasContent && !prevHasContentRef.current) {
      // 当开始有 content 时，自动折叠
      setIsExpanded(false)
    }
    
    prevHasContentRef.current = hasContent
  }, [isStreaming, hasContent, userToggled])

  // 用户手动切换
  const handleToggle = () => {
    setUserToggled(true)
    setIsExpanded(!isExpanded)
  }

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
        onClick={handleToggle}
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </motion.span>
        <Brain size={16} className={isStreaming && !hasContent ? 'animate-pulse' : ''} />
        <span className="text-sm font-medium">
          思考过程
          {isStreaming && !hasContent && (
            <motion.span
              className="ml-2 text-cyan-ink"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              思考中...
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
            <div className="mt-2 p-4 bg-paper-cream/50 border-l-4 border-cyan-ink rounded-r-sm max-h-96 overflow-y-auto">
              <p className="text-sm text-ink-medium whitespace-pre-wrap leading-relaxed">
                {content}
                {isStreaming && !hasContent && (
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
          {content.slice(0, 80)}...
        </motion.div>
      )}
    </motion.div>
  )
}
