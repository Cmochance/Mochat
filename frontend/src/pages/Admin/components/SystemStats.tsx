import { motion } from 'framer-motion'
import { Users, MessageSquare, MessagesSquare, TrendingUp, ShieldAlert } from 'lucide-react'
import Loading from '../../../components/common/Loading'
import type { SystemStats as SystemStatsType } from '../../../types'

interface SystemStatsProps {
  stats: SystemStatsType | null
  loading: boolean
}

export default function SystemStats({ stats, loading }: SystemStatsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading text="加载统计数据..." />
      </div>
    )
  }

  const statCards = [
    {
      label: '总用户数',
      value: stats?.user_count || 0,
      icon: Users,
      color: 'bg-cyan-ink',
    },
    {
      label: '对话数',
      value: stats?.session_count || 0,
      icon: MessagesSquare,
      color: 'bg-ink-black',
    },
    {
      label: '消息数',
      value: stats?.message_count || 0,
      icon: MessageSquare,
      color: 'bg-vermilion',
    },
    {
      label: '限制词',
      value: stats?.keyword_count || 0,
      icon: ShieldAlert,
      color: 'bg-amber-600',
    },
  ]

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-title text-ink-black">系统概览</h2>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <motion.div
            key={card.label}
            className="ink-card p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-sm ${card.color}`}>
                <card.icon size={24} className="text-paper-white" />
              </div>
              <div>
                <p className="text-ink-light text-sm">{card.label}</p>
                <p className="text-3xl font-title text-ink-black">
                  {card.value.toLocaleString()}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 系统信息 */}
      <motion.div
        className="ink-card p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-title text-ink-black mb-4 flex items-center gap-2">
          <TrendingUp size={20} />
          系统信息
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">平台名称</p>
            <p className="text-lg font-medium text-ink-black">墨语 Mochat</p>
          </div>
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">版本</p>
            <p className="text-lg font-medium text-ink-black">v1.4</p>
          </div>
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">前端框架</p>
            <p className="text-lg font-medium text-ink-black">React 18 + TypeScript</p>
          </div>
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">后端框架</p>
            <p className="text-lg font-medium text-ink-black">FastAPI + SQLAlchemy</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
