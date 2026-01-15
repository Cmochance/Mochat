/**
 * AI 图像生成面板组件
 * 支持显示 thinking 过程
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, Loader2, Download, X, ImageIcon, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useImageGenerate } from './useImageGenerate'
import type { PicgenConfig } from './types'

interface ImageGeneratePanelProps {
  config?: PicgenConfig
  userId?: string
  onImageGenerated?: (imageUrl: string, englishPrompt?: string) => void
  onClose?: () => void
}

export function ImageGeneratePanel({
  config,
  userId = 'anonymous',
  onImageGenerated,
  onClose,
}: ImageGeneratePanelProps) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<'1024x1024' | '1792x1024' | '1024x1792'>('1024x1024')
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard')
  const [showThinking, setShowThinking] = useState(true)
  
  const thinkingRef = useRef<HTMLDivElement>(null)

  const { 
    isGenerating, 
    thinking, 
    error, 
    result, 
    generate, 
    cancel,
    reset 
  } = useImageGenerate(config)

  // 自动滚动 thinking 区域到底部
  useEffect(() => {
    if (thinkingRef.current && thinking) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight
    }
  }, [thinking])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return

    const res = await generate({
      prompt: prompt.trim(),
      size,
      quality,
      userId,
    })

    if (res.success && res.imageUrl) {
      onImageGenerated?.(res.imageUrl, res.englishPrompt)
    }
  }, [prompt, size, quality, userId, generate, onImageGenerated])

  const handleDownload = useCallback(() => {
    if (!result?.imageUrl) return
    
    const link = document.createElement('a')
    link.href = result.imageUrl
    link.download = `ai-generated-${Date.now()}.png`
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [result])

  const handleReset = useCallback(() => {
    reset()
    setPrompt('')
  }, [reset])

  return (
    <div className="bg-paper-white rounded-sm shadow-lg border border-paper-aged overflow-hidden max-w-2xl w-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-cyan-ink/10 to-transparent border-b border-paper-aged">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-ink" />
          <span className="font-title text-ink-black">AI 绘图</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-ink-faint/20 rounded transition-colors"
          >
            <X size={18} className="text-ink-medium" />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="p-4 space-y-4">
        {/* 提示词输入 */}
        <div>
          <label className="block text-sm text-ink-medium mb-1">描述你想要的图像</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：一只戴着墨镜的橘猫在沙滩上晒太阳，水彩画风格..."
            className="w-full h-24 px-3 py-2 border border-paper-aged rounded-sm resize-none focus:outline-none focus:border-cyan-ink transition-colors"
            disabled={isGenerating}
          />
          <div className="text-xs text-ink-faint text-right mt-1">
            {prompt.length}/2000
          </div>
        </div>

        {/* 参数选择 */}
        <div className="flex gap-4">
          {/* 尺寸 */}
          <div className="flex-1">
            <label className="block text-sm text-ink-medium mb-1">尺寸</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as typeof size)}
              className="w-full px-3 py-2 border border-paper-aged rounded-sm focus:outline-none focus:border-cyan-ink"
              disabled={isGenerating}
            >
              <option value="1024x1024">1:1 (1024×1024)</option>
              <option value="1792x1024">16:9 (1792×1024)</option>
              <option value="1024x1792">9:16 (1024×1792)</option>
            </select>
          </div>

          {/* 质量 */}
          <div className="flex-1">
            <label className="block text-sm text-ink-medium mb-1">质量</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as typeof quality)}
              className="w-full px-3 py-2 border border-paper-aged rounded-sm focus:outline-none focus:border-cyan-ink"
              disabled={isGenerating}
            >
              <option value="standard">标准</option>
              <option value="hd">高清</option>
            </select>
          </div>
        </div>

        {/* 生成/取消按钮 */}
        <div className="flex gap-2">
          <motion.button
            onClick={isGenerating ? cancel : handleGenerate}
            disabled={!isGenerating && !prompt.trim()}
            className={`
              flex-1 py-3 rounded-sm font-medium flex items-center justify-center gap-2
              ${isGenerating 
                ? 'bg-vermilion/80 text-paper-white hover:bg-vermilion' 
                : !prompt.trim()
                  ? 'bg-ink-faint text-ink-medium cursor-not-allowed'
                  : 'bg-ink-black text-paper-white hover:bg-ink-dark'
              }
              transition-colors
            `}
            whileHover={prompt.trim() || isGenerating ? { scale: 1.01 } : {}}
            whileTap={prompt.trim() || isGenerating ? { scale: 0.99 } : {}}
          >
            {isGenerating ? (
              <>
                <X className="w-5 h-5" />
                <span>取消生成</span>
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                <span>开始生成</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Thinking 区域 */}
        <AnimatePresence>
          {(isGenerating || thinking) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {/* 折叠控制 */}
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="w-full flex items-center justify-between px-3 py-2 bg-ink-faint/10 rounded-t-sm text-sm text-ink-medium hover:bg-ink-faint/20 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {isGenerating && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  处理过程
                </span>
                {showThinking ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {/* Thinking 内容 */}
              <AnimatePresence>
                {showThinking && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      ref={thinkingRef}
                      className="max-h-48 overflow-y-auto p-3 bg-ink-faint/5 border border-t-0 border-paper-aged rounded-b-sm font-mono text-xs text-ink-medium whitespace-pre-wrap"
                    >
                      {thinking || '准备中...'}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 bg-vermilion/10 border border-vermilion/30 rounded-sm text-sm text-vermilion"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 生成结果 */}
        <AnimatePresence>
          {result?.success && result.imageUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-3"
            >
              {/* 英文提示词 */}
              {result.englishPrompt && (
                <div className="p-3 bg-cyan-ink/5 border border-cyan-ink/20 rounded-sm">
                  <p className="text-xs text-ink-faint mb-1">优化后的英文提示词：</p>
                  <p className="text-sm text-ink-medium">{result.englishPrompt}</p>
                </div>
              )}
              
              {/* 图像预览 */}
              <div className="relative aspect-square bg-paper-cream rounded-sm overflow-hidden border border-paper-aged">
                <img
                  src={result.imageUrl}
                  alt="AI 生成的图像"
                  className="w-full h-full object-contain"
                />
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-2">
                <motion.button
                  onClick={handleDownload}
                  className="flex-1 py-2 px-4 bg-cyan-ink/10 hover:bg-cyan-ink/20 text-cyan-ink rounded-sm flex items-center justify-center gap-2 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download size={16} />
                  下载图像
                </motion.button>
                <motion.button
                  onClick={handleReset}
                  className="py-2 px-4 bg-paper-aged/50 hover:bg-paper-aged text-ink-medium rounded-sm flex items-center justify-center gap-2 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <ImageIcon size={16} />
                  重新生成
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default ImageGeneratePanel
