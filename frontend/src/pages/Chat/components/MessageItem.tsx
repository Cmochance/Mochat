import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, X, FileText, Copy, Check, RefreshCw } from 'lucide-react'
import ThinkingBlock from './ThinkingBlock'
import type { Message } from '../../../types'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// 解析文档标记，提取文件名和可见内容
// 支持两种格式：
// 1. 新格式（只有元数据）: <!-- DOC:filename:key --><!-- /DOC -->
// 2. 旧格式（包含内容）: <!-- DOC:filename -->内容<!-- /DOC -->
function parseDocContent(content: string): { 
  displayContent: string
  docFiles: string[] 
} {
  const docFiles: string[] = []
  
  // 匹配新格式: <!-- DOC:filename:key --><!-- /DOC -->
  const newPattern = /<!-- DOC:([^:]+?):[^>]+? --><!-- \/DOC -->/g
  let match
  while ((match = newPattern.exec(content)) !== null) {
    docFiles.push(match[1])
  }
  
  // 匹配旧格式: <!-- DOC:filename -->...<!-- /DOC -->
  const oldPattern = /<!-- DOC:([^:>]+?) -->[\s\S]*?<!-- \/DOC -->/g
  while ((match = oldPattern.exec(content)) !== null) {
    // 避免重复添加
    if (!docFiles.includes(match[1])) {
      docFiles.push(match[1])
    }
  }
  
  // 移除所有文档标记，只保留用户的文字消息
  let displayContent = content
    .replace(/<!-- DOC:[^>]+? --><!-- \/DOC -->/g, '')  // 新格式
    .replace(/<!-- DOC:[^>]+? -->[\s\S]*?<!-- \/DOC -->/g, '')  // 旧格式
    .trim()
  
  return { displayContent, docFiles }
}

interface MessageItemProps {
  message: Message
  index: number
  isStreaming?: boolean
  isLastAiMessage?: boolean
  onRegenerate?: () => void
}

// 图片消息组件（带 Lightbox）
function ImageWithLightbox({ 
  src, 
  alt,
  className = ''
}: { 
  src: string
  alt?: string
  className?: string
}) {
  const [showLightbox, setShowLightbox] = useState(false)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <span className="text-ink-faint">[图片加载失败]</span>
  }

  return (
    <>
      <img
        src={src}
        alt={alt || '图片'}
        loading="lazy"
        onClick={() => setShowLightbox(true)}
        onError={() => setFailed(true)}
        className={`max-w-[300px] rounded-lg shadow-md cursor-pointer 
                   hover:shadow-lg transition-shadow duration-200 ${className}`}
      />
      
      {/* Lightbox 模态框 */}
      <AnimatePresence>
        {showLightbox && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center 
                       bg-ink-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLightbox(false)}
          >
            <motion.img
              src={src}
              alt={alt || '图片'}
              className="max-w-[90vw] max-h-[90vh] rounded-sm shadow-2xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            />
            {/* 关闭按钮 */}
            <button
              className="absolute top-4 right-4 p-2 text-paper-white 
                         hover:bg-paper-white/20 rounded-full transition-colors"
              onClick={() => setShowLightbox(false)}
            >
              <X size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// 通用 Markdown 渲染组件
function MarkdownContent({ 
  content, 
  isUser = false 
}: { 
  content: string
  isUser?: boolean 
}) {
  return (
    <div className={isUser ? '' : 'markdown-content'}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 代码块渲染
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const inline = !match
            return !inline ? (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: '1rem 0',
                  borderRadius: '0.125rem',
                  fontSize: '0.875rem',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code 
                className={`${className || ''} ${isUser ? 'bg-paper-white/20 px-1 rounded' : 'bg-paper-aged px-1 rounded'}`} 
                {...props}
              >
                {children}
              </code>
            )
          },
          // 图片渲染（带 Lightbox）
          img({ src, alt }) {
            if (!src) return null
            return <ImageWithLightbox src={src} alt={alt} />
          },
          // 段落渲染
          p({ children }) {
            return <p className="whitespace-pre-wrap mb-2 last:mb-0">{children}</p>
          },
          // 链接渲染
          a({ href, children }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                className={isUser ? 'text-cyan-300 underline' : 'text-cyan-ink underline'}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default function MessageItem({ 
  message, 
  index, 
  isStreaming = false,
  isLastAiMessage = false,
  onRegenerate
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  
  // 对用户消息解析文档标记
  const { displayContent, docFiles } = isUser 
    ? parseDocContent(message.content || '')
    : { displayContent: message.content || '', docFiles: [] }

  // 复制消息内容
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <motion.div
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      {/* 头像 */}
      <div
        className={`
          w-10 h-10 rounded-full flex items-center justify-center shrink-0
          ${isUser ? 'bg-cyan-ink' : 'bg-ink-black'}
        `}
      >
        {isUser ? (
          <User size={20} className="text-paper-white" />
        ) : (
          <span className="text-paper-white font-title">墨</span>
        )}
      </div>

      {/* 消息内容 */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Thinking块（仅AI消息） */}
        {!isUser && message.thinking && (
          <ThinkingBlock
            content={message.thinking}
            isStreaming={isStreaming}
            hasContent={!!message.content}
          />
        )}

        {/* 文档标签（用户消息上方） */}
        {isUser && docFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {docFiles.map((fileName, i) => (
              <div 
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ink-black/80 text-paper-white text-sm rounded-sm"
              >
                <FileText size={14} />
                <span className="max-w-[200px] truncate">{fileName}</span>
              </div>
            ))}
          </div>
        )}

        {/* 消息气泡 */}
        {(displayContent || !isUser || isStreaming) && (
          <div
            className={`
              p-4 rounded-sm max-h-[400px] overflow-y-auto
              ${isUser
                ? 'bg-ink-black text-paper-white'
                : 'bg-paper-white border border-paper-aged text-ink-black'
              }
            `}
          >
            <MarkdownContent 
              content={displayContent || (isStreaming ? '▌' : '')} 
              isUser={isUser}
            />
          </div>
        )}

        {/* AI 消息操作按钮 */}
        {!isUser && !isStreaming && message.content && (
          <div className="flex items-center gap-1 mt-1.5">
            {/* 复制按钮 */}
            <motion.button
              onClick={handleCopy}
              className="p-1.5 text-ink-faint hover:text-ink-medium hover:bg-paper-aged/50 rounded transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="复制内容"
            >
              {copied ? (
                <Check size={14} className="text-jade" />
              ) : (
                <Copy size={14} />
              )}
            </motion.button>

            {/* 重新生成按钮（仅最后一条 AI 消息显示） */}
            {isLastAiMessage && onRegenerate && (
              <motion.button
                onClick={onRegenerate}
                className="p-1.5 text-ink-faint hover:text-ink-medium hover:bg-paper-aged/50 rounded transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="重新生成"
              >
                <RefreshCw size={14} />
              </motion.button>
            )}
          </div>
        )}

        {/* 时间戳 */}
        <p className={`text-xs text-ink-faint mt-1 ${isUser ? 'text-right' : ''}`}>
          {new Date(message.created_at).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </motion.div>
  )
}
