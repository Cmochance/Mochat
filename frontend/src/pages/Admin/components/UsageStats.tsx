import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Activity, MessageSquare, Image, FileSpreadsheet, RefreshCw, Download, ListFilter } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import type { UsageEvent, UsageStats as UsageStatsType } from '../../../types'

const EVENT_PAGE_SIZE = 20

export default function UsageStats() {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<UsageStatsType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState<'chat' | 'image' | 'ppt' | ''>('')
  const [statusFilter, setStatusFilter] = useState<'success' | 'failed' | ''>('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  const [showEvents, setShowEvents] = useState(false)
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [eventsPage, setEventsPage] = useState(1)
  const [eventsTotal, setEventsTotal] = useState(0)
  const [reconcileSummary, setReconcileSummary] = useState<{
    users_checked: number
    user_total_mismatches: number
    aggregate_mismatches: number
  } | null>(null)

  const getTierName = (stat: UsageStatsType) => {
    return i18n.language === 'zh' ? stat.tier_name_zh : stat.tier_name_en
  }

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

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')
  }

  const queryParams = useMemo(() => {
    const query: {
      q?: string
      action?: 'chat' | 'image' | 'ppt'
      status?: 'success' | 'failed'
      start_at?: string
      end_at?: string
    } = {}
    if (searchTerm.trim()) query.q = searchTerm.trim()
    if (actionFilter) query.action = actionFilter
    if (statusFilter) query.status = statusFilter
    if (startAt) query.start_at = new Date(startAt).toISOString()
    if (endAt) query.end_at = new Date(endAt).toISOString()
    return query
  }, [actionFilter, endAt, searchTerm, startAt, statusFilter])

  const loadStats = async () => {
    setLoading(true)
    try {
      const data = await adminService.getUsageStats({ ...queryParams, page: 1, page_size: 500 })
      setStats(data)
    } catch (error) {
      console.error('加载使用量统计失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadEvents = async (page = 1) => {
    setLoadingEvents(true)
    try {
      const data = await adminService.getUsageEvents({
        ...queryParams,
        page,
        page_size: EVENT_PAGE_SIZE,
      })
      setEvents(data.items)
      setEventsTotal(data.total)
      setEventsPage(data.page)
    } catch (error) {
      console.error('加载事件流水失败:', error)
    } finally {
      setLoadingEvents(false)
    }
  }

  const handleExport = async () => {
    try {
      await adminService.exportUsageEvents(queryParams)
    } catch (error) {
      console.error('导出使用量事件失败:', error)
    }
  }

  const handleReconcile = async () => {
    try {
      const data = await adminService.reconcileUsage()
      setReconcileSummary(data.summary)
    } catch (error) {
      console.error('执行对账失败:', error)
    }
  }

  const applyFilters = async () => {
    await loadStats()
    if (showEvents) {
      await loadEvents(1)
    }
  }

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (showEvents) {
      loadEvents(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEvents])

  const totalEventPages = Math.max(1, Math.ceil(eventsTotal / EVENT_PAGE_SIZE))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-ink-faint">{t('admin.usage.loadingUsage')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-title text-ink-black flex items-center gap-2">
          <Activity className="text-cyan-ink" />
          {t('admin.usage.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            onClick={applyFilters}
            className="px-4 py-2 bg-paper-cream hover:bg-paper-aged border-2 border-paper-aged rounded-sm flex items-center gap-2 text-sm transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw size={16} />
            {t('admin.usage.refresh')}
          </motion.button>
          <motion.button
            onClick={handleExport}
            className="px-4 py-2 bg-paper-cream hover:bg-paper-aged border-2 border-paper-aged rounded-sm flex items-center gap-2 text-sm transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Download size={16} />
            {t('admin.usage.exportCsv')}
          </motion.button>
          <motion.button
            onClick={() => setShowEvents((prev) => !prev)}
            className="px-4 py-2 bg-paper-cream hover:bg-paper-aged border-2 border-paper-aged rounded-sm flex items-center gap-2 text-sm transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ListFilter size={16} />
            {showEvents ? t('admin.usage.hideEvents') : t('admin.usage.viewEvents')}
          </motion.button>
          <motion.button
            onClick={handleReconcile}
            className="px-4 py-2 bg-paper-cream hover:bg-paper-aged border-2 border-paper-aged rounded-sm flex items-center gap-2 text-sm transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FileSpreadsheet size={16} />
            {t('admin.usage.reconcile')}
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          type="text"
          placeholder={t('admin.users.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 border-2 border-paper-aged rounded-sm bg-paper-white focus:outline-none focus:border-ink-medium"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as 'chat' | 'image' | 'ppt' | '')}
          className="px-3 py-2 border-2 border-paper-aged rounded-sm bg-paper-white focus:outline-none focus:border-ink-medium"
        >
          <option value="">{t('admin.usage.filters.allActions')}</option>
          <option value="chat">Chat</option>
          <option value="image">Image</option>
          <option value="ppt">PPT</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'success' | 'failed' | '')}
          className="px-3 py-2 border-2 border-paper-aged rounded-sm bg-paper-white focus:outline-none focus:border-ink-medium"
        >
          <option value="">{t('admin.usage.filters.allStatus')}</option>
          <option value="success">{t('admin.usage.filters.success')}</option>
          <option value="failed">{t('admin.usage.filters.failed')}</option>
        </select>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="px-3 py-2 border-2 border-paper-aged rounded-sm bg-paper-white focus:outline-none focus:border-ink-medium"
        />
        <input
          type="datetime-local"
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          className="px-3 py-2 border-2 border-paper-aged rounded-sm bg-paper-white focus:outline-none focus:border-ink-medium"
        />
      </div>

      <div className="flex justify-end">
        <motion.button
          onClick={applyFilters}
          className="px-4 py-2 bg-ink-black text-paper-white hover:bg-ink-dark rounded-sm text-sm transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {t('common.search')}
        </motion.button>
      </div>

      {reconcileSummary && (
        <div className="bg-paper-cream border-2 border-paper-aged rounded-sm p-3 text-sm text-ink-medium flex flex-wrap gap-6">
          <span>{t('admin.usage.reconcileUsers')}: {reconcileSummary.users_checked}</span>
          <span>{t('admin.usage.reconcileUserMismatch')}: {reconcileSummary.user_total_mismatches}</span>
          <span>{t('admin.usage.reconcileAggMismatch')}: {reconcileSummary.aggregate_mismatches}</span>
        </div>
      )}

      <div className="bg-paper-white border-2 border-paper-aged rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px]">
            <thead className="bg-paper-cream">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.user')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.tier')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.chatUsage')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.imageUsage')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.pptUsage')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.failedToday')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.totalSuccess')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.totalFailed')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.usage.tableHeaders.lastUsedAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-aged">
              {stats.map((stat) => (
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
                  <td className="px-4 py-3 text-sm text-ink-medium">
                    {stat.is_unlimited ? t('admin.usage.unlimited') : `${stat.chat_used}/${stat.chat_limit}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-medium">
                    {stat.is_unlimited ? t('admin.usage.unlimited') : `${stat.image_used}/${stat.image_limit}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-medium">{stat.ppt_used ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-ink-medium">
                    C:{stat.chat_failed_today ?? 0} I:{stat.image_failed_today ?? 0} P:{stat.ppt_failed_today ?? 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-medium">
                    C:{stat.chat_total_success ?? 0} I:{stat.image_total_success ?? 0} P:{stat.ppt_total_success ?? 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-medium">
                    C:{stat.chat_total_failed ?? 0} I:{stat.image_total_failed ?? 0} P:{stat.ppt_total_failed ?? 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-medium">{formatDateTime(stat.last_used_at)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {stats.length === 0 && (
          <div className="text-center py-8 text-ink-faint">{t('admin.usage.noData')}</div>
        )}
      </div>

      {showEvents && (
        <div className="bg-paper-white border-2 border-paper-aged rounded-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-paper-aged bg-paper-cream text-sm font-medium text-ink-medium">
            {t('admin.usage.eventsTitle')}
          </div>
          {loadingEvents ? (
            <div className="py-8 text-center text-ink-faint">{t('admin.usage.loadingEvents')}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead className="bg-paper-cream/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">Request ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">Error</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-ink-medium">Occurred At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-aged">
                    {events.map((event) => (
                      <tr key={event.id} className="hover:bg-paper-cream/40 transition-colors">
                        <td className="px-4 py-2 text-xs text-ink-medium">
                          <div>{event.username}</div>
                          <div className="text-ink-faint">{event.email}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-ink-medium">{event.action}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className={event.status === 'success' ? 'text-cyan-ink' : 'text-vermilion'}>{event.status}</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-ink-medium font-mono">{event.request_id}</td>
                        <td className="px-4 py-2 text-xs text-ink-medium">{event.source}</td>
                        <td className="px-4 py-2 text-xs text-vermilion">{event.error_code || '-'}</td>
                        <td className="px-4 py-2 text-xs text-ink-medium">{formatDateTime(event.occurred_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-paper-aged flex items-center justify-between text-sm">
                <span className="text-ink-faint">
                  {t('admin.usage.eventsPagination', {
                    page: eventsPage,
                    totalPages: totalEventPages,
                    total: eventsTotal,
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1 border border-paper-aged rounded-sm disabled:opacity-40"
                    disabled={eventsPage <= 1}
                    onClick={() => loadEvents(eventsPage - 1)}
                  >
                    {t('admin.usage.prev')}
                  </button>
                  <button
                    className="px-3 py-1 border border-paper-aged rounded-sm disabled:opacity-40"
                    disabled={eventsPage >= totalEventPages}
                    onClick={() => loadEvents(eventsPage + 1)}
                  >
                    {t('admin.usage.next')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="text-xs text-ink-faint flex items-center gap-2">
        <MessageSquare size={12} />
        <Image size={12} />
        <span>{t('admin.usage.note')}</span>
      </div>
    </div>
  )
}
