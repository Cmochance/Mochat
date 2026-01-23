import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { 
  Users, 
  BarChart3, 
  Settings, 
  ArrowLeft,
  LogOut,
  ShieldAlert
} from 'lucide-react'
import UserManagement from './components/UserManagement'
import SystemStats from './components/SystemStats'
import ModelConfig from './components/ModelConfig'
import KeywordManagement from './components/KeywordManagement'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { useAuthStore } from '../../stores/authStore'
import { adminService } from '../../services/adminService'
import type { User, SystemStats as SystemStatsType } from '../../types'

type TabType = 'stats' | 'users' | 'config' | 'keywords'

export default function Admin() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabType>('stats')
  const [stats, setStats] = useState<SystemStatsType | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsData, usersData] = await Promise.all([
        adminService.getStats(),
        adminService.getUsers(),
      ])
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

  const tabs = [
    { id: 'stats' as const, label: t('admin.tabs.stats'), icon: BarChart3 },
    { id: 'users' as const, label: t('admin.tabs.users'), icon: Users },
    { id: 'config' as const, label: t('admin.tabs.config'), icon: Settings },
    { id: 'keywords' as const, label: t('admin.tabs.keywords'), icon: ShieldAlert },
  ]

  return (
    <div className="h-screen flex flex-col bg-paper-gradient overflow-hidden">
      {/* 顶部导航 */}
      <motion.header
        className="bg-ink-dark text-paper-white flex-shrink-0"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="flex items-center gap-2 text-paper-cream hover:text-paper-white transition-colors"
              onClick={() => navigate('/chat')}
            >
              <ArrowLeft size={20} />
              {t('common.backToChat')}
            </button>
            <div className="h-6 w-px bg-ink-medium" />
            <h1 className="text-xl font-title">{t('admin.title')}</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-paper-cream text-sm">
              {t('admin.adminLabel')}{user?.username}
            </span>
            <button
              className="flex items-center gap-2 px-3 py-1.5 bg-vermilion/20 hover:bg-vermilion/30 rounded-sm text-vermilion-light transition-colors"
              onClick={handleLogout}
            >
              <LogOut size={16} />
              {t('common.logout')}
            </button>
          </div>
        </div>

        {/* 标签页 */}
        <div className="container mx-auto px-6">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'bg-paper-white text-ink-black'
                    : 'text-paper-cream hover:text-paper-white hover:bg-ink-medium'
                  }
                `}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </motion.header>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'stats' && (
              <SystemStats stats={stats} loading={loading} />
            )}
            {activeTab === 'users' && (
              <UserManagement
                users={users}
                loading={loading}
                onRefresh={loadData}
              />
            )}
            {activeTab === 'config' && <ModelConfig />}
            {activeTab === 'keywords' && <KeywordManagement />}
          </motion.div>
        </div>
      </main>

      {/* 语言切换按钮 */}
      <LanguageSwitcher />
    </div>
  )
}
