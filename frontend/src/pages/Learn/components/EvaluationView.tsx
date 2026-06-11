import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, Award, Layers, XCircle, RefreshCw, ChevronDown, ChevronUp, BookOpen, CheckCircle, Info } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useLearnStore } from '../../../stores/learnStore'
import { learnService } from '../../../services/learnService'

interface EvaluationViewProps {
  materialId: number
  onSwitchToTab: (tab: 'chat' | 'flashcards' | 'quiz' | 'map' | 'evaluation') => void
}

export default function EvaluationView({ materialId, onSwitchToTab }: EvaluationViewProps) {
  const { t } = useTranslation()
  const {
    wrongQuestions,
    evaluationReport,
    evaluationLoading,
    setWrongQuestions,
    setEvaluationReport,
    setEvaluationLoading,
    setCurrentQuizDetail,
    setQuizLoading,
    addQuiz,
  } = useLearnStore()

  const [isGeneratingAdaptive, setIsGeneratingAdaptive] = useState(false)
  const [expandedMistakeId, setExpandedMistakeId] = useState<number | null>(null)

  const loadEvaluationData = async () => {
    setEvaluationLoading(true)
    try {
      const reportRes = await learnService.getEvaluationReport(materialId)
      setEvaluationReport(reportRes)
      
      const wrongRes = await learnService.getWrongQuestions(materialId)
      setWrongQuestions(wrongRes.wrong_questions)
    } catch (err) {
      console.error('Failed to load evaluation data', err)
    } finally {
      setEvaluationLoading(false)
    }
  }

  useEffect(() => {
    loadEvaluationData()
  }, [materialId])

  const handleAdaptiveQuiz = async () => {
    setIsGeneratingAdaptive(true)
    setQuizLoading(true)
    try {
      const newQuiz = await learnService.generateAdaptiveQuiz(materialId)
      addQuiz(newQuiz)
      
      // 加载生成的测验详情
      const detail = await learnService.getQuizDetail(newQuiz.id)
      setCurrentQuizDetail(detail)
      
      // 切换到测验 Tab
      onSwitchToTab('quiz')
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('learn.evaluation.adaptiveError', '生成自适应测验失败，请重试'))
    } finally {
      setIsGeneratingAdaptive(false)
      setQuizLoading(false)
    }
  }

  if (evaluationLoading && !evaluationReport) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p className="text-sm">{t('learn.evaluation.loading', 'AI 正在分析你的学习数据并生成评估报告...')}</p>
      </div>
    )
  }

  const report = evaluationReport

  return (
    <div className="flex flex-col h-full bg-paper-cream overflow-y-auto p-6 space-y-6">
      {/* 顶部操作区 */}
      <div className="flex items-center justify-between border-b border-paper-aged pb-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-black flex items-center gap-2">
            <Award className="text-ink-black" size={20} />
            {t('learn.evaluation.title', 'AI 学习评估与诊断报告')}
          </h2>
          <p className="text-xs text-ink-faint mt-1">
            {t('learn.evaluation.subtitle', '基于你的测验记录与闪卡记忆状态，进行自适应学习反馈')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadEvaluationData()}
            disabled={evaluationLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-paper-aged rounded-sm text-ink-medium hover:text-ink-black hover:bg-paper-white bg-transparent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={evaluationLoading ? 'animate-spin' : ''} />
            {t('learn.evaluation.refresh', '重新评估')}
          </button>
          <button
            onClick={handleAdaptiveQuiz}
            disabled={isGeneratingAdaptive || (report?.wrong_questions_count || 0) === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ink-black text-paper-white rounded-sm hover:bg-ink-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              (report?.wrong_questions_count || 0) === 0 
                ? t('learn.evaluation.noWrongQuizTip', '暂无错题，不需要进行强化训练')
                : t('learn.evaluation.adaptiveQuizTip', '针对错题对应的薄弱知识点，自动生成 5 道自适应强化练习题')
            }
          >
            <Sparkles size={12} />
            {t('learn.evaluation.adaptiveQuiz', '错题强化训练')}
          </button>
        </div>
      </div>

      {report ? (
        <>
          {/* 核心指标统计 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-paper-white border border-paper-aged rounded-sm p-4 flex flex-col justify-between shadow-sm">
              <span className="text-xs text-ink-faint">{t('learn.evaluation.quizzesCount', '测验次数')}</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-bold text-ink-black">{report.quizzes_count}</span>
                <span className="text-xs text-ink-faint">{t('learn.evaluation.unitTimes', '次')}</span>
              </div>
            </div>
            <div className="bg-paper-white border border-paper-aged rounded-sm p-4 flex flex-col justify-between shadow-sm">
              <span className="text-xs text-ink-faint">{t('learn.evaluation.averageAccuracy', '平均正确率')}</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className={`text-2xl font-bold ${report.average_accuracy >= 80 ? 'text-green-700' : report.average_accuracy >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                  {report.average_accuracy.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="bg-paper-white border border-paper-aged rounded-sm p-4 flex flex-col justify-between shadow-sm">
              <span className="text-xs text-ink-faint">{t('learn.evaluation.wrongQuestions', '错题总数')}</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-bold text-ink-black">{report.wrong_questions_count}</span>
                <span className="text-xs text-ink-faint">{t('learn.evaluation.unitItems', '道')}</span>
              </div>
            </div>
            <div className="bg-paper-white border border-paper-aged rounded-sm p-4 flex flex-col justify-between shadow-sm">
              <span className="text-xs text-ink-faint">{t('learn.evaluation.flashcardsTotal', '闪卡覆盖')}</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-bold text-ink-black">{report.flashcards_total}</span>
                <span className="text-xs text-ink-faint">{t('learn.evaluation.unitCards', '张')}</span>
              </div>
            </div>
          </div>

          {/* 艾宾浩斯复习盒子记忆进度 */}
          <div className="bg-paper-white border border-paper-aged rounded-sm p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-ink-black flex items-center gap-1.5 border-b border-paper-aged pb-2">
              <Layers size={14} />
              {t('learn.evaluation.ebbinghausTitle', 'Leitner 艾宾浩斯复习盒子记忆进度')}
            </h3>
            <div className="grid grid-cols-5 gap-2 pt-2">
              {report.flashcards_by_box.map((count, idx) => {
                const total = report.flashcards_total || 1
                const percentage = Math.round((count / total) * 100)
                return (
                  <div key={idx} className="flex flex-col items-center p-3 border border-paper-aged bg-paper-cream rounded-sm">
                    <span className="text-[10px] text-ink-faint">{t('learn.evaluation.boxLabel', '盒子 {{num}}', { num: idx + 1 })}</span>
                    <span className="text-lg font-bold text-ink-black mt-1">{count}</span>
                    <span className="text-[9px] text-ink-faint mt-0.5">{percentage}%</span>
                    <div className="w-full bg-paper-white h-1.5 rounded-full mt-2 overflow-hidden border border-paper-aged">
                      <div 
                        className="bg-ink-black h-full" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-ink-faint italic mt-2">
              {t('learn.evaluation.ebbinghausDesc', '注：卡片答对会移入更高序号的盒子，复习周期变长；答错则会退回盒子 1。盒子 5 的卡片代表已永久掌握。')}
            </p>
          </div>

          {/* AI 诊断报告 */}
          <div className="bg-paper-white border border-paper-aged rounded-sm p-6 shadow-sm space-y-3">
            <h3 className="text-xs font-semibold text-ink-black flex items-center gap-1.5 border-b border-paper-aged pb-2">
              <Sparkles size={14} className="text-ink-black" />
              {t('learn.evaluation.diagnosticTitle', 'AI 多维学情诊断评估报告')}
            </h3>
            <div className="prose prose-sm max-w-none text-ink-medium leading-relaxed font-serif text-sm">
              <ReactMarkdown>{report.ai_diagnostic}</ReactMarkdown>
            </div>
          </div>

          {/* 错题集笔记本 */}
          <div className="bg-paper-white border border-paper-aged rounded-sm p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-ink-black flex items-center gap-1.5 border-b border-paper-aged pb-2">
              <BookOpen size={14} />
              {t('learn.evaluation.wrongListTitle', '自适应错题集笔记本')}
            </h3>
            {wrongQuestions.length > 0 ? (
              <div className="space-y-3">
                {wrongQuestions.map((q) => {
                  const isExpanded = expandedMistakeId === q.id
                  let optionsList: string[] = []
                  if (q.options) {
                    try {
                      optionsList = JSON.parse(q.options)
                    } catch (e) {
                      // ignore
                    }
                  }

                  return (
                    <div key={q.id} className="border border-paper-aged rounded-sm overflow-hidden bg-paper-cream">
                      {/* 错题头部简述 */}
                      <div 
                        onClick={() => setExpandedMistakeId(isExpanded ? null : q.id)}
                        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-paper-aged transition-colors"
                      >
                        <div className="flex items-center gap-2 mr-4 min-w-0">
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-800 border border-red-200 rounded-sm shrink-0">
                            {q.question_type === 'single' ? t('learn.quiz.singleChoice') : t('learn.quiz.booleanChoice')}
                          </span>
                          <p className="text-xs font-medium text-ink-black truncate">{q.question_text}</p>
                        </div>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>

                      {/* 错题详情展开 */}
                      {isExpanded && (
                        <div className="p-4 border-t border-paper-aged bg-paper-white space-y-3 text-xs">
                          <div className="font-semibold text-ink-black">
                            {q.question_text}
                          </div>
                          
                          {/* 选项渲染 */}
                          {q.question_type === 'single' && optionsList.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 my-2 pl-2 border-l-2 border-paper-aged">
                              {optionsList.map((opt, i) => {
                                const optLabel = String.fromCharCode(65 + i)
                                return (
                                  <div key={i} className="text-ink-medium">
                                    <span className="font-semibold mr-1">{optLabel}.</span>
                                    {opt}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* 作答反馈与解析 */}
                          <div className="grid grid-cols-2 gap-4 border-t border-b border-paper-aged py-2.5 my-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-faint">{t('learn.evaluation.yourAnswer', '你的回答：')}</span>
                              <span className="font-semibold text-red-700 flex items-center gap-0.5">
                                <XCircle size={12} />
                                {q.user_answer}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-faint">{t('learn.evaluation.correctAnswer', '正确答案：')}</span>
                              <span className="font-semibold text-green-700 flex items-center gap-0.5">
                                <CheckCircle size={12} />
                                {q.correct_answer}
                              </span>
                            </div>
                          </div>

                          {q.explanation && (
                            <div className="bg-paper-cream p-3 border border-paper-aged rounded-sm text-ink-medium flex gap-2">
                              <Info size={14} className="shrink-0 text-ink-faint mt-0.5" />
                              <div>
                                <span className="font-semibold text-ink-black mr-1">{t('learn.quiz.explanationTitle')}</span>
                                {q.explanation}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed border-paper-aged rounded-sm text-ink-faint">
                <CheckCircle size={24} className="text-green-700 opacity-60 mb-2" />
                <p className="text-xs">{t('learn.evaluation.noWrongQuestions', '太棒了！当前没有任何错题记录。继续保持！')}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-ink-faint">
          <Award size={48} className="mb-4 opacity-30" />
          <p className="text-lg mb-1">{t('learn.evaluation.emptyTitle', '生成你的第一份学习评估')}</p>
          <p className="text-sm mb-4">{t('learn.evaluation.emptySubtitle', 'AI 将对你的错题与闪卡进度进行综合诊断')}</p>
          <button
            onClick={() => loadEvaluationData()}
            className="px-4 py-2 text-xs font-medium bg-ink-black text-paper-white rounded-sm hover:bg-ink-medium transition-colors"
          >
            {t('learn.evaluation.generateReport', '生成评估报告')}
          </button>
        </div>
      )}
    </div>
  )
}
