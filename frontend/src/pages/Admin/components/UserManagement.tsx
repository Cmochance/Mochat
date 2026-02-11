import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  RefreshCw, 
  UserCheck, 
  UserX, 
  Trash2,
  Shield,
  User as UserIcon,
  Eye,
  EyeOff,
  ChevronDown
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { adminService } from '../../../services/adminService'
import Loading from '../../../components/common/Loading'
import Modal from '../../../components/common/Modal'
import Button from '../../../components/common/Button'
import type { User } from '../../../types'

// 等级选项
const TIER_OPTIONS = [
  { id: 'free', name_zh: '普通用户', name_en: 'Free User' },
  { id: 'pro', name_zh: '高级用户', name_en: 'Pro User' },
  { id: 'plus', name_zh: '超级用户', name_en: 'Plus User' },
]

interface UserManagementProps {
  users: User[]
  loading: boolean
  onRefresh: () => void
}

export default function UserManagement({ users, loading, onRefresh }: UserManagementProps) {
  const { t, i18n } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Set<number>>(new Set())

  const togglePasswordVisibility = (userId: number) => {
    setVisiblePasswordIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleToggleStatus = async (user: User) => {
    setActionLoading(true)
    try {
      await adminService.toggleUserStatus(user.id)
      onRefresh()
    } catch (error) {
      console.error('切换状态失败:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    setActionLoading(true)
    try {
      await adminService.deleteUser(selectedUser.id)
      setShowDeleteModal(false)
      setSelectedUser(null)
      onRefresh()
    } catch (error) {
      console.error('删除用户失败:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleTierChange = async (userId: number, newTier: string) => {
    try {
      await adminService.updateUserTier(userId, newTier)
      onRefresh()
    } catch (error) {
      console.error('更新用户等级失败:', error)
    }
  }

  // 获取等级样式
  const getTierStyle = (tier?: string) => {
    switch (tier) {
      case 'plus':
        return 'bg-amber-100 text-amber-700'
      case 'pro':
        return 'bg-cyan-100 text-cyan-700'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading text={t('admin.users.loadingUsers')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="sticky top-0 z-10 flex flex-col gap-4 rounded-md border border-line-soft bg-paper-white/90 p-3 backdrop-blur-sm sm:flex-row sm:justify-between">
        <h2 className="text-2xl font-title text-ink-black">{t('admin.users.title')}</h2>
        
        <div className="flex gap-3">
          {/* 搜索 */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light" />
            <input
              type="text"
              placeholder={t('admin.users.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-paper-white border border-line-soft rounded-sm focus:outline-none focus:border-ink-medium"
            />
          </div>
          
          {/* 刷新 */}
          <Button variant="ghost" onClick={onRefresh}>
            <RefreshCw size={18} />
          </Button>
        </div>
      </div>

      {/* 用户表格 */}
      <div className="ink-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-paper-cream">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.user')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.email')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.passwordHash')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.role')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.tier')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.status')}</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.registeredAt')}</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-ink-medium">{t('admin.users.tableHeaders.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-aged">
              <AnimatePresence>
                {filteredUsers.map((user, index) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-paper-cream/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-vermilion' : 'bg-cyan-ink'}`}>
                          {user.role === 'admin' ? (
                            <Shield size={14} className="text-paper-white" />
                          ) : (
                            <UserIcon size={14} className="text-paper-white" />
                          )}
                        </div>
                        <span className="font-medium text-ink-black">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-ink-medium">{user.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-ink-light bg-paper-cream px-2 py-1 rounded max-w-[120px] truncate">
                          {visiblePasswordIds.has(user.id) 
                            ? (user.password_hash || t('admin.users.none')) 
                            : '••••••••'}
                        </code>
                        <button
                          className="p-1 rounded hover:bg-paper-cream transition-colors text-ink-light hover:text-ink-dark"
                          onClick={() => togglePasswordVisibility(user.id)}
                          title={visiblePasswordIds.has(user.id) ? t('common.hide') : t('common.show')}
                        >
                          {visiblePasswordIds.has(user.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-sm ${user.role === 'admin' ? 'bg-vermilion/10 text-vermilion' : 'bg-cyan-ink/10 text-cyan-ink'}`}>
                        {user.role === 'admin' ? t('common.admin') : t('common.user')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'admin' ? (
                        <span className="px-2 py-1 text-xs rounded-sm bg-vermilion/10 text-vermilion">
                          {i18n.language === 'zh' ? '管理员' : 'Admin'}
                        </span>
                      ) : (
                        <div className="relative inline-block">
                          <select
                            value={user.tier || 'free'}
                            onChange={(e) => handleTierChange(user.id, e.target.value)}
                            className={`
                              appearance-none px-2 py-1 pr-6 text-xs rounded-sm cursor-pointer
                              border-0 focus:outline-none focus:ring-2 focus:ring-ink-medium
                              ${getTierStyle(user.tier)}
                            `}
                          >
                            {TIER_OPTIONS.map((tier) => (
                              <option key={tier.id} value={tier.id}>
                                {i18n.language === 'zh' ? tier.name_zh : tier.name_en}
                              </option>
                            ))}
                          </select>
                          <ChevronDown 
                            size={12} 
                            className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" 
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-sm ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? t('common.active') : t('common.disabled')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-light">
                      {new Date(user.created_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className={`p-2 rounded-sm transition-colors ${user.is_active ? 'hover:bg-yellow-100 text-yellow-600' : 'hover:bg-green-100 text-green-600'}`}
                          onClick={() => handleToggleStatus(user)}
                          title={user.is_active ? t('common.disable') : t('common.enable')}
                        >
                          {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                        <button
                          className="p-2 rounded-sm hover:bg-red-100 text-red-600 transition-colors"
                          onClick={() => {
                            setSelectedUser(user)
                            setShowDeleteModal(true)
                          }}
                          title={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-ink-light">
            {t('admin.users.noData')}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('admin.users.confirmDelete')}
      >
        <p className="text-ink-medium mb-6">
          {t('admin.users.confirmDeleteMessage', { username: selectedUser?.username })}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="seal"
            onClick={handleDeleteUser}
            loading={actionLoading}
          >
            {t('admin.users.confirmDelete')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
