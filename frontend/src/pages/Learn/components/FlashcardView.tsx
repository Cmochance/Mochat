import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Loader2,
  Sparkles,
  Layers,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLearnStore } from '../../../stores/learnStore'
import { learnService } from '../../../services/learnService'
import type { Flashcard } from '../../../types'

interface FlashcardViewProps {
  materialId: number
}

export default function FlashcardView({ materialId }: FlashcardViewProps) {
  const { t } = useTranslation()
  const {
    flashcards,
    flashcardLoading,
    currentCardIndex,
    isFlipped,
    setFlashcards,
    setFlashcardLoading,
    setCurrentCardIndex,
    setIsFlipped,
    updateFlashcardStatus,
  } = useLearnStore()

  const [direction, setDirection] = useState(0)

  const handleGenerate = useCallback(async () => {
    setFlashcardLoading(true)
    try {
      const res = await learnService.generateFlashcards(materialId)
      setFlashcards(res.flashcards)
    } catch {
      // ignore
    } finally {
      setFlashcardLoading(false)
    }
  }, [materialId, setFlashcards, setFlashcardLoading])

  const handleLoad = useCallback(async () => {
    setFlashcardLoading(true)
    try {
      const res = await learnService.getFlashcards(materialId)
      setFlashcards(res.flashcards)
    } catch {
      // ignore
    } finally {
      setFlashcardLoading(false)
    }
  }, [materialId, setFlashcards, setFlashcardLoading])

  // 初次加载
  useState(() => {
    handleLoad()
  })

  const currentCard = flashcards[currentCardIndex]

  const goNext = () => {
    if (currentCardIndex < flashcards.length - 1) {
      setDirection(1)
      setCurrentCardIndex(currentCardIndex + 1)
    }
  }

  const goPrev = () => {
    if (currentCardIndex > 0) {
      setDirection(-1)
      setCurrentCardIndex(currentCardIndex - 1)
    }
  }

  const handleMark = async (status: 'learning' | 'mastered') => {
    if (!currentCard) return
    try {
      await learnService.updateFlashcardStatus(currentCard.id, status)
      updateFlashcardStatus(currentCard.id, status)
      // 自动跳到下一张
      if (currentCardIndex < flashcards.length - 1) {
        setDirection(1)
        setCurrentCardIndex(currentCardIndex + 1)
      }
    } catch {
      // ignore
    }
  }

  // 统计
  const stats = {
    new: flashcards.filter((c) => c.status === 'new').length,
    learning: flashcards.filter((c) => c.status === 'learning').length,
    mastered: flashcards.filter((c) => c.status === 'mastered').length,
  }

  if (flashcardLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p className="text-sm">{t('learn.flashcards.generating')}</p>
      </div>
    )
  }

  if (flashcards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint p-4">
        <Layers size={40} className="mb-3 opacity-30" />
        <p className="text-sm mb-4">{t('learn.flashcards.empty')}</p>
        <button
          onClick={handleGenerate}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm
                     bg-ink-black text-paper-white rounded-sm
                     hover:bg-ink-medium transition-colors"
        >
          <Sparkles size={14} />
          {t('learn.flashcards.generateBtn')}
        </button>
      </div>
    )
  }

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 200 : -200, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -200 : 200, opacity: 0 }),
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：统计 + 重新生成 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-paper-aged">
        <div className="flex items-center gap-3 text-xs text-ink-faint">
          <span>{t('learn.flashcards.total', { count: flashcards.length })}</span>
          <span className="text-green-600">✓ {stats.mastered}</span>
          <span className="text-yellow-600">◐ {stats.learning}</span>
          <span>○ {stats.new}</span>
        </div>
        <button
          onClick={handleGenerate}
          className="text-xs text-ink-faint hover:text-ink-black transition-colors flex items-center gap-1"
        >
          <RotateCcw size={12} />
          {t('learn.flashcards.regenerate')}
        </button>
      </div>

      {/* 卡片区域 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {/* 进度条 */}
        <div className="w-full max-w-md mb-4">
          <div className="flex items-center justify-between text-xs text-ink-faint mb-1">
            <span>{currentCardIndex + 1} / {flashcards.length}</span>
          </div>
          <div className="w-full h-1 bg-paper-aged rounded-full">
            <div
              className="h-1 bg-ink-black rounded-full transition-all"
              style={{ width: `${((currentCardIndex + 1) / flashcards.length) * 100}%` }}
            />
          </div>
        </div>

        {/* 闪卡 */}
        <div className="w-full max-w-md perspective-1000">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentCard.id + (isFlipped ? '-back' : '-front')}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
              className={`w-full min-h-[200px] rounded-sm border cursor-pointer select-none
                flex items-center justify-center p-6 text-center
                ${isFlipped
                  ? 'bg-ink-black text-paper-white border-ink-black'
                  : 'bg-paper-white text-ink-black border-paper-aged'
                }`}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div className="whitespace-pre-wrap break-words text-base leading-relaxed">
                {isFlipped ? currentCard.back : currentCard.front}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-xs text-ink-faint mt-3">{t('learn.flashcards.clickToFlip')}</p>

        {/* 操作按钮 */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={goPrev}
            disabled={currentCardIndex === 0}
            className="p-2 rounded-sm hover:bg-paper-aged disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>

          {isFlipped && (
            <>
              <button
                onClick={() => handleMark('learning')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-sm
                           border border-yellow-500 text-yellow-600
                           hover:bg-yellow-50 transition-colors"
              >
                <X size={14} />
                {t('learn.flashcards.stillLearning')}
              </button>
              <button
                onClick={() => handleMark('mastered')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-sm
                           bg-green-600 text-white
                           hover:bg-green-700 transition-colors"
              >
                <Check size={14} />
                {t('learn.flashcards.mastered')}
              </button>
            </>
          )}

          <button
            onClick={goNext}
            disabled={currentCardIndex === flashcards.length - 1}
            className="p-2 rounded-sm hover:bg-paper-aged disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
