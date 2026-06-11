import { useCallback, useState, useEffect } from 'react'
import {
  Plus,
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  HelpCircle,
  ArrowRight,
  Award,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLearnStore } from '../../../stores/learnStore'
import { learnService } from '../../../services/learnService'
import Button from '../../../components/common/Button'

interface QuizViewProps {
  materialId: number
}

export default function QuizView({ materialId }: QuizViewProps) {
  const { t } = useTranslation()
  const {
    quizzes,
    currentQuizDetail,
    quizLoading,
    setQuizzes,
    addQuiz,
    setCurrentQuizDetail,
    setQuizLoading,
    submitQuestionAnswer,
  } = useLearnStore()

  const [activeQuizId, setActiveQuizId] = useState<number | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 加载测验列表
  const loadQuizzes = useCallback(async () => {
    setQuizLoading(true)
    try {
      const res = await learnService.getQuizzes(materialId)
      setQuizzes(res.quizzes)
    } catch {
      // ignore
    } finally {
      setQuizLoading(false)
    }
  }, [materialId, setQuizzes, setQuizLoading])

  useEffect(() => {
    loadQuizzes()
  }, [loadQuizzes])

  // 开始新测验
  const handleCreateQuiz = async () => {
    setQuizLoading(true)
    try {
      const newQuiz = await learnService.generateQuiz(materialId)
      addQuiz(newQuiz)
      handleSelectQuiz(newQuiz.id)
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('learn.quiz.generateError'))
    } finally {
      setQuizLoading(false)
    }
  }

  // 进入特定测验
  const handleSelectQuiz = async (quizId: number) => {
    setQuizLoading(true)
    try {
      const res = await learnService.getQuizDetail(quizId)
      setCurrentQuizDetail(res)
      setActiveQuizId(quizId)
      setCurrentQuestionIndex(0)
    } catch {
      // ignore
    } finally {
      setQuizLoading(false)
    }
  }

  // 退出答题/查看模式，回到列表
  const handleBackToList = () => {
    setActiveQuizId(null)
    setCurrentQuizDetail(null)
    loadQuizzes()
  }

  // 选择答案
  const handleSelectOption = (questionId: number, option: string) => {
    if (currentQuizDetail?.quiz.is_completed) return
    submitQuestionAnswer(questionId, option)
  }

  // 提交整卷
  const handleSubmitQuiz = async () => {
    if (!currentQuizDetail || isSubmitting) return
    setIsSubmitting(true)

    // 构建提交体
    const answers = currentQuizDetail.questions.map((q) => ({
      question_id: q.id,
      user_answer: q.user_answer || '',
    }))

    try {
      const res = await learnService.submitQuiz(currentQuizDetail.quiz.id, answers)
      setCurrentQuizDetail(res)
    } catch (err) {
      // ignore
    } finally {
      setIsSubmitting(false)
    }
  }

  if (quizLoading && !activeQuizId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p className="text-sm">{t('learn.quiz.loading')}</p>
      </div>
    )
  }

  // ============ 列表模式 ============
  if (!activeQuizId) {
    return (
      <div className="flex flex-col h-full bg-paper-cream overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-paper-aged bg-paper-white">
          <h3 className="text-sm font-medium text-ink-black flex items-center gap-1.5">
            <HelpCircle size={16} />
            {t('learn.quiz.historyTitle')}
          </h3>
          <button
            onClick={handleCreateQuiz}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                       bg-ink-black text-paper-white rounded-sm
                       hover:bg-ink-medium transition-colors"
          >
            <Sparkles size={12} />
            {t('learn.quiz.startNew')}
          </button>
        </div>

        {/* 测验历史列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-ink-faint py-12">
              <HelpCircle size={40} className="mb-2 opacity-30" />
              <p className="text-sm mb-4">{t('learn.quiz.emptyHistory')}</p>
              <Button onClick={handleCreateQuiz}>
                <Plus size={16} className="mr-1.5" />
                {t('learn.quiz.startNew')}
              </Button>
            </div>
          ) : (
            quizzes.map((quiz) => (
              <div
                key={quiz.id}
                onClick={() => handleSelectQuiz(quiz.id)}
                className="flex items-center justify-between p-4 bg-paper-white border border-paper-aged
                           rounded-sm hover:border-ink-faint cursor-pointer transition-all hover:shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-ink-black">
                    {t('learn.quiz.quizSession', { id: quiz.id })}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {new Date(quiz.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  {quiz.is_completed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-green-50 text-xs font-semibold text-green-700 border border-green-200">
                      <Award size={12} />
                      {t('learn.quiz.scoreRatio', { score: quiz.score, total: quiz.total_questions })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-yellow-50 text-xs font-semibold text-yellow-700 border border-yellow-200">
                      {t('learn.quiz.uncompleted')}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ============ 答题 / 报告模式 ============
  if (!currentQuizDetail) return null

  const { quiz, questions } = currentQuizDetail
  const currentQuestion = questions[currentQuestionIndex]

  // 解析选项数组
  let parsedOptions: string[] = []
  if (currentQuestion?.options) {
    try {
      parsedOptions = JSON.parse(currentQuestion.options)
    } catch {
      parsedOptions = []
    }
  } else if (currentQuestion?.question_type === 'boolean') {
    parsedOptions = ['正确', '错误']
  }

  // 统计完成度
  const answeredCount = questions.filter((q) => q.user_answer !== null).length
  const isAllAnswered = answeredCount === questions.length

  return (
    <div className="flex flex-col h-full bg-paper-cream overflow-hidden">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-paper-aged bg-paper-white">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-1 text-xs text-ink-medium hover:text-ink-black transition-colors"
        >
          <ArrowLeft size={14} />
          {t('learn.quiz.backToList')}
        </button>
        <span className="text-xs text-ink-faint">
          {quiz.is_completed ? t('learn.quiz.reportTitle') : t('learn.quiz.progressTitle', { current: currentQuestionIndex + 1, total: questions.length })}
        </span>
      </div>

      {/* 核心答题区 */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {/* 报告得分看板 */}
        {quiz.is_completed && (
          <div className="mb-6 p-4 bg-paper-white border border-paper-aged rounded-sm flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-ink-black">{t('learn.quiz.scoreBoardTitle')}</h4>
              <p className="text-xs text-ink-faint">{t('learn.quiz.scoreBoardDesc')}</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-ink-black">{quiz.score}</span>
              <span className="text-sm text-ink-faint">/ {quiz.total_questions}</span>
            </div>
          </div>
        )}

        {/* 题目内容卡片 */}
        {currentQuestion && (
          <div className="bg-paper-white border border-paper-aged rounded-sm p-5 space-y-4">
            {/* 题号 & 题型 */}
            <div className="flex items-center gap-2">
              <span className="text-xs bg-ink-black text-paper-white px-2 py-0.5 rounded-sm">
                Q{currentQuestionIndex + 1}
              </span>
              <span className="text-xs text-ink-faint">
                {currentQuestion.question_type === 'single' ? t('learn.quiz.singleChoice') : t('learn.quiz.booleanChoice')}
              </span>
            </div>

            {/* 题干 */}
            <h4 className="text-sm font-medium text-ink-black leading-relaxed">
              {currentQuestion.question_text}
            </h4>

            {/* 选项列表 */}
            <div className="space-y-2">
              {parsedOptions.map((opt) => {
                const isSelected = currentQuestion.user_answer === opt
                const showCorrect = quiz.is_completed && currentQuestion.correct_answer === opt
                const showWrong = quiz.is_completed && isSelected && currentQuestion.correct_answer !== opt

                let optStyle = 'border-paper-aged text-ink-black hover:border-ink-medium'
                if (isSelected && !quiz.is_completed) {
                  optStyle = 'border-ink-black bg-ink-black/5 text-ink-black font-medium'
                } else if (quiz.is_completed) {
                  if (showCorrect) {
                    optStyle = 'border-green-600 bg-green-50 text-green-700 font-semibold'
                  } else if (showWrong) {
                    optStyle = 'border-red-600 bg-red-50 text-red-700 font-semibold'
                  } else if (isSelected) {
                    optStyle = 'border-paper-aged bg-paper-cream text-ink-faint'
                  } else {
                    optStyle = 'border-paper-aged text-ink-faint opacity-60'
                  }
                }

                return (
                  <button
                    key={opt}
                    disabled={quiz.is_completed}
                    onClick={() => handleSelectOption(currentQuestion.id, opt)}
                    className={`w-full text-left px-4 py-3 text-xs border rounded-sm transition-all flex items-center justify-between ${optStyle}`}
                  >
                    <span>{opt}</span>
                    {quiz.is_completed && showCorrect && <CheckCircle size={14} className="text-green-600 shrink-0" />}
                    {quiz.is_completed && showWrong && <XCircle size={14} className="text-red-600 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* 解析展示（已完成测验时展示） */}
            {quiz.is_completed && currentQuestion.explanation && (
              <div className="mt-4 p-4 bg-paper-cream border-t border-paper-aged rounded-sm space-y-2">
                <p className="text-xs font-semibold text-ink-black">{t('learn.quiz.explanationTitle')}</p>
                <p className="text-xs text-ink-medium leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.explanation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部导航/提交区域 */}
      <div className="border-t border-paper-aged bg-paper-white p-3 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="px-3 py-1.5 text-xs border border-paper-aged rounded-sm text-ink-medium
                       hover:bg-paper-aged disabled:opacity-30 transition-colors"
          >
            {t('learn.quiz.prevQuestion')}
          </button>
          <button
            onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            disabled={currentQuestionIndex === questions.length - 1}
            className="px-3 py-1.5 text-xs border border-paper-aged rounded-sm text-ink-medium
                       hover:bg-paper-aged disabled:opacity-30 transition-colors"
          >
            {t('learn.quiz.nextQuestion')}
          </button>
        </div>

        {!quiz.is_completed ? (
          <button
            onClick={handleSubmitQuiz}
            disabled={!isAllAnswered || isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium
                       bg-ink-black text-paper-white rounded-sm
                       hover:bg-ink-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {t('learn.quiz.submitting')}
              </>
            ) : (
              <>
                <ArrowRight size={12} />
                {t('learn.quiz.submit')}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleBackToList}
            className="px-4 py-2 text-xs font-medium bg-ink-black text-paper-white rounded-sm
                       hover:bg-ink-medium transition-colors"
          >
            {t('learn.quiz.done')}
          </button>
        )}
      </div>
    </div>
  )
}
