import { useEffect, useRef } from 'react'

interface StreamingMessageProps {
  content: string
  thinking: string
}

/**
 * 流式消息组件 - 使用 ref 直接操作 DOM
 * 完全绕过 React 的渲染机制，实现真正的实时更新
 */
export default function StreamingMessage({ content, thinking }: StreamingMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const thinkingRef = useRef<HTMLDivElement>(null)

  // 直接操作 DOM 更新内容，绕过 React 渲染
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.textContent = content
    }
  }, [content])

  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.textContent = thinking
    }
  }, [thinking])

  return (
    <div className="flex gap-4">
      {/* 头像 */}
      <div className="w-10 h-10 rounded-full bg-ink-black flex items-center justify-center shrink-0">
        <span className="text-paper-white font-title">墨</span>
      </div>

      {/* 消息内容 */}
      <div className="flex-1 max-w-[80%]">
        {/* Thinking块 */}
        {thinking && (
          <div className="mb-3 px-3 py-2 bg-ink-black/5 border-l-2 border-ink-faint rounded-r-sm max-h-[200px] overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 text-xs text-ink-faint mb-1 sticky top-0 bg-ink-black/5 -mx-3 px-3 py-1">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              <span>思考中...</span>
            </div>
            <div 
              ref={thinkingRef}
              className="text-sm text-ink-light whitespace-pre-wrap"
            >
              {thinking}
            </div>
          </div>
        )}

        {/* 消息气泡 */}
        <div className="rounded-sm bg-paper-white border border-paper-aged p-4 text-ink-black">
          <div className="whitespace-pre-wrap break-words">
            <span ref={contentRef}>{content}</span>
            <span className="inline-block w-2 h-4 bg-ink-medium animate-pulse ml-0.5 align-middle" />
          </div>
        </div>

        {/* 时间戳 */}
        <p className="text-xs text-ink-faint mt-1">
          {new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}
