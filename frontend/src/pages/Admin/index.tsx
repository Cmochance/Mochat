import { useEffect, useState, type ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  LogOut,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { useAuthStore } from '../../stores/authStore'
import { adminService } from '../../services/adminService'
import type { SystemStats as SystemStatsType, User } from '../../types'
import KeywordManagement from './components/KeywordManagement'
import ModelConfig from './components/ModelConfig'
import SystemStats from './components/SystemStats'
import UsageStats from './components/UsageStats'
import UserManagement from './components/UserManagement'

type TabType = 'stats' | 'users' | 'usage' | 'config' | 'keywords'

export default function Admin() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { t } = useTranslation()

  const [activeTab, setActiveTab] = useState<TabType>('stats')
  const [stats, setStats] = useState<SystemStatsType | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadData()
  }, [])

  const tabs: Array<{ id: TabType; label: string; icon: ElementType }> = [
    { id: 'stats', label: t('admin.tabs.stats'), icon: BarChart3 },
    { id: 'users', label: t('admin.tabs.users'), icon: Users },
    { id: 'usage', label: t('admin.tabs.usage'), icon: Activity },
    { id: 'config', label: t('admin.tabs.config'), icon: Settings },
    { id: 'keywords', label: t('admin.tabs.keywords'), icon: ShieldAlert },
  ]

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsData, usersData] = await Promise.all([adminService.getStats(), adminService.getUsers()])
      setStats(statsData)
      setUsers(usersData)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-canvas-gradient">
      <header className="border-b border-line-soft bg-paper-white/85 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-ui text-ink-light transition-colors hover:bg-paper-cream hover:text-ink-black"
              onClick={() => navigate('/chat')}
            >
              <ArrowLeft size={16} />
              {t('common.backToChat')}
            </button>
            <div className="hidden h-5 w-px bg-line-soft md:block" />
            <h1 className="text-xl font-title text-ink-black">{t('admin.title')}</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-ui text-text-secondary md:inline">
              {t('admin.adminLabel')}
              {user?.username}
            </span>
            <LanguageSwitcher position="inline" />
            <button
              className="flex items-center gap-2 rounded-md border border-vermilion/40 bg-vermilion/10 px-3 py-1.5 text-sm font-ui text-vermilion transition-colors hover:bg-vermilion/20"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              {t('common.logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-1 min-h-0 w-full overflow-hidden px-2 py-3 md:px-4 md:py-4">
        <aside className="hidden w-56 shrink-0 border-r border-line-soft pr-3 lg:block">
          <div className="space-y-1 rounded-lg border border-line-soft bg-paper-white/80 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-ui transition-colors
                  ${activeTab === tab.id
                    ? 'bg-ink-black text-paper-white'
                    : 'text-text-secondary hover:bg-paper-cream hover:text-ink-black'
                  }
                `}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto px-2 lg:px-4">
          <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg border border-line-soft bg-paper-white/80 p-1 lg:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-ui transition-colors
                  ${activeTab === tab.id
                    ? 'bg-ink-black text-paper-white'
                    : 'text-text-secondary hover:bg-paper-cream hover:text-ink-black'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'stats' && <SystemStats stats={stats} loading={loading} />}
            {activeTab === 'users' && <UserManagement users={users} loading={loading} onRefresh={loadData} />}
            {activeTab === 'usage' && <UsageStats />}
            {activeTab === 'config' && <ModelConfig />}
            {activeTab === 'keywords' && <KeywordManagement />}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
