import { motion } from 'framer-motion'
import { Users, MessageSquare, MessagesSquare, TrendingUp, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Loading from '../../../components/common/Loading'
import type { SystemStats as SystemStatsType } from '../../../types'

interface SystemStatsProps {
  stats: SystemStatsType | null
  loading: boolean
}

export default function SystemStats({ stats, loading }: SystemStatsProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading text={t('admin.stats.loadingStats')} />
      </div>
    )
  }

  const statCards = [
    {
      label: t('admin.stats.totalUsers'),
      value: stats?.user_count || 0,
      icon: Users,
      color: 'bg-cyan-ink',
    },
    {
      label: t('admin.stats.sessions'),
      value: stats?.session_count || 0,
      icon: MessagesSquare,
      color: 'bg-ink-black',
    },
    {
      label: t('admin.stats.messages'),
      value: stats?.message_count || 0,
      icon: MessageSquare,
      color: 'bg-vermilion',
    },
    {
      label: t('admin.stats.keywords'),
      value: stats?.keyword_count || 0,
      icon: ShieldAlert,
      color: 'bg-amber-600',
    },
  ]

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-title text-ink-black">{t('admin.stats.title')}</h2>

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
          {t('admin.stats.systemInfo')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">{t('admin.stats.platformName')}</p>
            <p className="text-lg font-medium text-ink-black">{t('welcome.brand')} Mochat</p>
          </div>
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">{t('admin.stats.version')}</p>
            <p className="text-lg font-medium text-ink-black">v1.5</p>
          </div>
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">{t('admin.stats.frontend')}</p>
            <p className="text-lg font-medium text-ink-black">React 18 + TypeScript</p>
          </div>
          <div className="p-4 bg-paper-cream rounded-sm">
            <p className="text-sm text-ink-light">{t('admin.stats.backend')}</p>
            <p className="text-lg font-medium text-ink-black">FastAPI + SQLAlchemy</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
