import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Activity, MessageSquare, Image, RefreshCw } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import type { UsageStats as UsageStatsType } from '../../../types'

export default function UsageStats() {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<UsageStatsType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setLoading(true)
    try {
      const data = await adminService.getUsageStats()
      setStats(data)
    } catch (error) {
      console.error('加载使用量统计失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 过滤用户
  const filteredStats = stats.filter(stat =>
    stat.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stat.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 获取等级显示名称
  const getTierName = (stat: UsageStatsType) => {
    return i18n.language === 'zh' ? stat.tier_name_zh : stat.tier_name_en
  }

  // 获取等级标签样式
  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'admin':
        return 'bg-vermilion/20 text-vermilion'
      case 'plus':
        return 'bg-amber-500/20 text-amber-600'
      case 'pro':
        return 'bg-cyan-500/20 text-cyan-600'
      default:
        return 'bg-ink-faint/20 text-ink-medium'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-ink-faint">{t('admin.usage.loadingUsage')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题和刷新按钮 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-title text-ink-black flex items-center gap-2">
          <Activity className="text-cyan-ink" />
          {t('admin.usage.title')}
        </h2>
        <motion.button
          onClick={loadStats}
          className="px-4 py-2 bg-paper-cream hover:bg-paper-aged border-2 border-paper-aged rounded-sm flex items-center gap-2 text-sm transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw size={16} />
          {t('common.loading').replace('...', '')}
        </motion.button>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('admin.users.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border-2 border-paper-aged rounded-sm bg-paper-white focus:outline-none focus:border-ink-medium"
        />
      </div>

      {/* 使用量表格 */}
      <div className="bg-paper-white border-2 border-paper-aged rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-paper-cream">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">
                  {t('admin.usage.tableHeaders.user')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">
                  {t('admin.usage.tableHeaders.tier')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">
                  <div className="flex items-center gap-1">
                    <MessageSquare size={14} />
                    {t('admin.usage.tableHeaders.chatUsage')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">
                  <div className="flex items-center gap-1">
                    <Image size={14} />
                    {t('admin.usage.tableHeaders.imageUsage')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-aged">
              {filteredStats.map((stat) => (
                <motion.tr
                  key={stat.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-paper-cream/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-ink-black">{stat.username}</p>
                      <p className="text-xs text-ink-faint">{stat.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-sm ${getTierStyle(stat.tier)}`}>
                      {getTierName(stat)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {stat.is_unlimited ? (
                      <span className="text-vermilion text-sm">{t('admin.usage.unlimited')}</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-paper-aged rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-ink rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, (stat.chat_used / stat.chat_limit) * 100)}%`
                              }}
                            />
                          </div>
                          <span className="text-sm text-ink-medium">
                            {stat.chat_used}/{stat.chat_limit}
                          </span>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {stat.is_unlimited ? (
                      <span className="text-vermilion text-sm">{t('admin.usage.unlimited')}</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-paper-aged rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, (stat.image_used / stat.image_limit) * 100)}%`
                              }}
                            />
                          </div>
                          <span className="text-sm text-ink-medium">
                            {stat.image_used}/{stat.image_limit}
                          </span>
                        </div>
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredStats.length === 0 && (
          <div className="text-center py-8 text-ink-faint">
            {t('admin.usage.noData')}
          </div>
        )}
      </div>
    </div>
  )
}
