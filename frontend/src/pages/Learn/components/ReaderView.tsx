import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, Highlighter, Trash2, X, Bookmark } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useLearnStore } from '../../../stores/learnStore'
import { learnService } from '../../../services/learnService'

interface ReaderViewProps {
  materialId: number
  rawText: string
  onExplainInChat: (text: string) => void
}

export default function ReaderView({ materialId, rawText, onExplainInChat }: ReaderViewProps) {
  const { t } = useTranslation()
  const {
    annotations,
    setAnnotations,
    addAnnotation,
    removeAnnotation,
  } = useLearnStore()

  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<{
    text: string
    rect: DOMRect
    startOffset?: number | null
    endOffset?: number | null
  } | null>(null)
  
  // 批注输入表单状态
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [highlightColor, setHighlightColor] = useState('yellow')
  
  const readerRef = useRef<HTMLDivElement>(null)
  const isHighlightClick = useRef(false)

  // 获取选择文本在阅读器容器中的字符偏移量
  const getSelectionCharacterOffsetWithin = (element: HTMLElement) => {
    let start = 0
    let end = 0
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      
      // 确保选区在容器内
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
        return null
      }
      
      const preCaretRange = range.cloneRange()
      preCaretRange.selectNodeContents(element)
      preCaretRange.setEnd(range.startContainer, range.startOffset)
      start = preCaretRange.toString().length
      end = start + range.toString().length
    }
    return { start, end }
  }

  // 对阅读器容器内的匹配字符段落应用高亮样式
  const applyHighlights = (container: HTMLElement, list: typeof annotations) => {
    // 1. 清理所有的 mark 高亮标签，恢复原有文本节点
    const existingSpans = container.querySelectorAll('mark.reader-highlight')
    existingSpans.forEach((span) => {
      const parent = span.parentNode
      if (parent) {
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span)
        }
        parent.removeChild(span)
      }
    })
    container.normalize()

    if (list.length === 0) return

    // 2. 排序（按起始偏移量升序）
    const sorted = [...list]
      .filter((a) => a.start_offset !== undefined && a.start_offset !== null && a.end_offset !== undefined && a.end_offset !== null && a.start_offset < a.end_offset)
      .sort((a, b) => (a.start_offset || 0) - (b.start_offset || 0))

    if (sorted.length === 0) return

    // 3. 收集所有的 Text 节点
    const textNodes: Text[] = []
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
    let node: Node | null
    while ((node = walk.nextNode())) {
      textNodes.push(node as Text)
    }

    // 4. 遍历并拆分/包装高亮节点
    let charIndex = 0
    let textNodeIndex = 0

    for (const hl of sorted) {
      const start = hl.start_offset!
      const end = hl.end_offset!
      const color = hl.color

      // 寻找到达 highlight 起始位置的文本节点
      while (textNodeIndex < textNodes.length) {
        const currentNode = textNodes[textNodeIndex]
        const len = currentNode.textContent?.length || 0
        if (charIndex + len > start) {
          break
        }
        charIndex += len
        textNodeIndex++
      }

      let currentHlStart = start
      while (textNodeIndex < textNodes.length && charIndex < end) {
        const currentNode = textNodes[textNodeIndex]
        const len = currentNode.textContent?.length || 0

        const relativeStart = Math.max(0, currentHlStart - charIndex)
        const relativeEnd = Math.min(len, end - charIndex)

        if (relativeStart < relativeEnd) {
          let targetNode = currentNode
          if (relativeStart > 0) {
            targetNode = currentNode.splitText(relativeStart)
            textNodes.splice(textNodeIndex + 1, 0, targetNode)
            textNodeIndex++
            charIndex += relativeStart
          }

          const remLen = targetNode.textContent?.length || 0
          const highlightLen = relativeEnd - relativeStart
          if (remLen > highlightLen) {
            const restNode = targetNode.splitText(highlightLen)
            textNodes.splice(textNodeIndex + 1, 0, restNode)
          }

          // 包装成 mark 标签
          const mark = document.createElement('mark')
          mark.className = `reader-highlight reader-highlight-${color} cursor-pointer transition-colors hover:brightness-95`
          mark.setAttribute('data-anno-id', String(hl.id))
          
          if (color === 'green') {
            mark.style.backgroundColor = '#dcfce7'
            mark.style.borderBottom = '2px solid #86efac'
          } else if (color === 'blue') {
            mark.style.backgroundColor = '#dbeafe'
            mark.style.borderBottom = '2px solid #93c5fd'
          } else if (color === 'pink') {
            mark.style.backgroundColor = '#fce7f3'
            mark.style.borderBottom = '2px solid #fbcfe8'
          } else {
            mark.style.backgroundColor = '#fef9c3'
            mark.style.borderBottom = '2px solid #fde047'
          }

          const parent = targetNode.parentNode
          if (parent) {
            parent.insertBefore(mark, targetNode)
            mark.appendChild(targetNode)
          }
        }

        charIndex += currentNode.textContent?.length || 0
        textNodeIndex++
      }
    }
  }

  const loadAnnotations = async () => {
    setLoading(true)
    try {
      const res = await learnService.getAnnotations(materialId)
      setAnnotations(res.annotations)
    } catch (err) {
      console.error('Failed to load annotations', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnnotations()
  }, [materialId])

  useEffect(() => {
    if (readerRef.current) {
      applyHighlights(readerRef.current, annotations)
    }
  }, [annotations, rawText])

  useEffect(() => {
    const handleScroll = () => {
      if (selection) {
        handleClearSelection()
      }
    }
    const readerEl = readerRef.current
    if (readerEl) {
      readerEl.addEventListener('scroll', handleScroll)
    }
    return () => {
      if (readerEl) {
        readerEl.removeEventListener('scroll', handleScroll)
      }
    }
  }, [selection])

  const handleMouseUp = () => {
    if (isHighlightClick.current) {
      isHighlightClick.current = false
      return
    }

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) {
      handleClearSelection()
      return
    }
    const text = sel.toString().trim()
    if (text.length === 0) {
      handleClearSelection()
      return
    }

    // 确保选择在阅读器容器内
    if (readerRef.current && !readerRef.current.contains(sel.anchorNode)) {
      handleClearSelection()
      return
    }

    const offsets = readerRef.current ? getSelectionCharacterOffsetWithin(readerRef.current) : null
    if (!offsets) {
      handleClearSelection()
      return
    }

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setSelection({
      text,
      rect,
      startOffset: offsets.start,
      endOffset: offsets.end,
    })
  };

  const handleClearSelection = () => {
    setSelection(null)
    setShowNoteForm(false)
    setNoteText('')
    // 清除浏览器选择蓝底
    window.getSelection()?.removeAllRanges()
  }

  const handleAIExplain = () => {
    if (!selection) return
    onExplainInChat(selection.text)
    handleClearSelection()
  }

  const handleSaveAnnotation = async () => {
    if (!selection) return
    try {
      const newAnno = await learnService.createAnnotation(
        materialId,
        selection.text,
        noteText.trim() || undefined,
        highlightColor,
        selection.startOffset,
        selection.endOffset
      )
      addAnnotation(newAnno)
      handleClearSelection()
    } catch (err) {
      console.error('Failed to save annotation', err)
      alert('保存批注失败，请重试')
    }
  }

  // 点击高亮标签跳转到右侧卡片并高亮闪烁
  const handleHighlightClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const mark = target.closest('mark.reader-highlight')
    if (mark) {
      const annoId = Number(mark.getAttribute('data-anno-id'))
      const cardEl = document.getElementById(`anno-card-${annoId}`)
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        cardEl.classList.add('ring-2', 'ring-ink-black')
        setTimeout(() => {
          cardEl.classList.remove('ring-2', 'ring-ink-black')
        }, 1500)
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('mark.reader-highlight')) {
      isHighlightClick.current = true
    } else {
      isHighlightClick.current = false
    }
  }

  const handleDeleteAnnotation = async (annoId: number) => {
    if (!confirm(t('learn.annotation.confirmDelete', '确定要删除这条批注吗？'))) return
    try {
      await learnService.deleteAnnotation(annoId)
      removeAnnotation(annoId)
    } catch (err) {
      console.error('Failed to delete annotation', err)
    }
  }

  // 获取高亮背景样式
  const getColorBgClass = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-100 border-green-200'
      case 'blue': return 'bg-blue-100 border-blue-200'
      case 'pink': return 'bg-pink-100 border-pink-200'
      case 'yellow':
      default:
        return 'bg-yellow-100 border-yellow-200'
    }
  }

  const getColorDotClass = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-400'
      case 'blue': return 'bg-blue-400'
      case 'pink': return 'bg-pink-400'
      case 'yellow':
      default:
        return 'bg-yellow-400'
    }
  }

  return (
    <div className="flex flex-col md:flex-row h-full bg-paper-cream overflow-hidden">
      {/* 左侧：原文献阅读区 */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-paper-aged h-full overflow-hidden">
        <div className="px-4 py-2 border-b border-paper-aged bg-paper-white flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-black flex items-center gap-1">
            <Bookmark size={12} />
            {t('learn.annotation.readerTitle', '原文献研读')}
          </span>
          <span className="text-[10px] text-ink-faint">
            {t('learn.annotation.selectHint', '提示：鼠标划选文本可唤起 AI 解释或添加高亮批注')}
          </span>
        </div>
        
        <div 
          ref={readerRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleHighlightClick}
          className="flex-1 overflow-y-auto p-6 bg-paper-white text-ink-medium font-serif leading-relaxed text-base select-text prose prose-sm max-w-none"
        >
          <ReactMarkdown>{rawText}</ReactMarkdown>
        </div>
      </div>

      {/* 右侧：批注笔记本面板 */}
      <div className="w-full md:w-80 shrink-0 bg-paper-white flex flex-col h-full overflow-hidden">
        <div className="px-4 py-3 border-b border-paper-aged bg-paper-white flex items-center justify-between">
          <h3 className="text-xs font-semibold text-ink-black flex items-center gap-1.5">
            <Highlighter size={14} />
            {t('learn.annotation.notebookTitle', '研读笔记 & 高亮')}
          </h3>
          <span className="text-[10px] text-ink-faint bg-paper-cream px-1.5 py-0.5 border border-paper-aged rounded-full">
            {annotations.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && annotations.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-ink-faint" size={20} />
            </div>
          ) : annotations.length > 0 ? (
            annotations.map((anno) => (
              <div 
                key={anno.id} 
                id={`anno-card-${anno.id}`}
                className={`p-3 border rounded-sm flex flex-col justify-between gap-2 shadow-sm transition-all duration-300 hover:shadow-md ${getColorBgClass(anno.color)}`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
                    <span className={`w-2 h-2 rounded-full ${getColorDotClass(anno.color)}`} />
                    <span>{new Date(anno.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs font-medium text-ink-black border-l border-ink-faint/20 pl-2 leading-relaxed italic">
                    "{anno.selected_text}"
                  </p>
                  {anno.note && (
                    <p className="text-xs text-ink-medium leading-relaxed font-sans pt-1 border-t border-ink-faint/10 mt-1">
                      {anno.note}
                    </p>
                  )}
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleDeleteAnnotation(anno.id)}
                    className="text-ink-faint hover:text-red-700 transition-colors p-1 rounded-sm hover:bg-black/5"
                    title={t('common.delete', '删除')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-paper-aged rounded-sm text-ink-faint p-4 text-center">
              <Highlighter size={28} className="opacity-30 mb-2" />
              <p className="text-xs">{t('learn.annotation.emptyNotebook', '暂无笔记。在左侧划选内容可以添加高亮批注。')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 划词悬浮菜单 */}
      {selection && (
        <div 
          className="fixed z-50 bg-paper-white border border-paper-aged shadow-lg rounded-sm p-1.5 flex flex-col gap-1 w-64 text-xs select-none"
          style={{
            top: `${Math.max(10, selection.rect.top - (showNoteForm ? 160 : 45))}px`,
            left: `${Math.max(10, Math.min(window.innerWidth - 270, selection.rect.left + selection.rect.width / 2 - 128))}px`,
          }}
        >
          {!showNoteForm ? (
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={handleAIExplain}
                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-sm text-ink-black hover:bg-paper-cream font-medium transition-colors"
              >
                <Sparkles size={12} />
                {t('learn.annotation.aiExplain', 'AI 解释')}
              </button>
              <div className="w-px h-4 bg-paper-aged" />
              <button
                onClick={() => setShowNoteForm(true)}
                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-sm text-ink-black hover:bg-paper-cream font-medium transition-colors"
              >
                <Highlighter size={12} />
                {t('learn.annotation.addHighlight', '高亮批注')}
              </button>
              <div className="w-px h-4 bg-paper-aged" />
              <button
                onClick={handleClearSelection}
                className="p-1 rounded-sm text-ink-faint hover:text-ink-black hover:bg-paper-cream transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="p-2 space-y-2.5">
              <div className="flex items-center justify-between border-b border-paper-aged pb-1.5">
                <span className="font-semibold text-ink-black">{t('learn.annotation.writeNote', '写批注')}</span>
                <button
                  onClick={() => setShowNoteForm(false)}
                  className="text-ink-faint hover:text-ink-black"
                >
                  <X size={12} />
                </button>
              </div>
              
              {/* 颜色选择 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-ink-faint">{t('learn.annotation.pickColor', '选择颜色：')}</span>
                <div className="flex gap-1.5">
                  {['yellow', 'green', 'blue', 'pink'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setHighlightColor(c)}
                      className={`w-3.5 h-3.5 rounded-full border transition-transform ${getColorDotClass(c)} ${
                        highlightColor === c ? 'scale-110 border-ink-black' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* 输入框 */}
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('learn.annotation.placeholder', '输入你的思考或疑问...')}
                rows={3}
                className="w-full p-1.5 border border-paper-aged rounded-sm bg-paper-cream text-xs text-ink-black outline-none focus:border-ink-black"
                autoFocus
              />

              {/* 保存按钮 */}
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  onClick={handleClearSelection}
                  className="px-2.5 py-1 text-[10px] border border-paper-aged rounded-sm hover:bg-paper-cream text-ink-medium"
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  onClick={handleSaveAnnotation}
                  className="px-2.5 py-1 text-[10px] bg-ink-black text-paper-white rounded-sm hover:bg-ink-medium"
                >
                  {t('common.save', '保存')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
