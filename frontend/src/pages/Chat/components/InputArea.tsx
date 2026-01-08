import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send } from 'lucide-react'

interface InputAreaProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export default function InputArea({ onSend, disabled = false }: InputAreaProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }, [content])

  const handleSubmit = () => {
    if (!content.trim() || disabled) return
    onSend(content.trim())
    setContent('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <motion.div
      className="border-t border-paper-aged bg-paper-white/80 backdrop-blur-sm p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="relative flex items-end gap-3">
          {/* 输入框 */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入消息，按 Enter 发送，Shift + Enter 换行..."
              disabled={disabled}
              rows={1}
              className={`
                w-full px-4 py-3 pr-12
                bg-paper-white border-2 border-paper-aged
                rounded-sm resize-none
                text-ink-black placeholder-ink-faint
                focus:outline-none focus:border-ink-medium
                transition-colors duration-300
                disabled:opacity-50 disabled:cursor-not-allowed
                font-body
              `}
              style={{ minHeight: '52px', maxHeight: '200px' }}
            />
            
            {/* 字数统计 */}
            <span className="absolute right-3 bottom-3 text-xs text-ink-faint">
              {content.length}
            </span>
          </div>

          {/* 发送按钮 */}
          <motion.button
            onClick={handleSubmit}
            disabled={!content.trim() || disabled}
            className={`
              p-3 rounded-sm
              ${content.trim() && !disabled
                ? 'bg-ink-black text-paper-white hover:bg-ink-dark'
                : 'bg-paper-aged text-ink-faint cursor-not-allowed'
              }
              transition-colors duration-300
            `}
            whileHover={content.trim() && !disabled ? { scale: 1.05 } : {}}
            whileTap={content.trim() && !disabled ? { scale: 0.95 } : {}}
          >
            <Send size={20} />
          </motion.button>
        </div>

        {/* 提示文字 */}
        <p className="text-xs text-ink-faint mt-2 text-center">
          墨聊AI可能会产生错误信息，请核实重要内容
        </p>
      </div>
    </motion.div>
  )
}
