import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  RefreshCw, 
  UserCheck, 
  UserX, 
  Trash2,
  Shield,
  User as UserIcon
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import Loading from '../../../components/common/Loading'
import Modal from '../../../components/common/Modal'
import Button from '../../../components/common/Button'
import type { User } from '../../../types'

interface UserManagementProps {
  users: User[]
  loading: boolean
  onRefresh: () => void
}

export default function UserManagement({ users, loading, onRefresh }: UserManagementProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading text="加载用户列表..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <h2 className="text-2xl font-title text-ink-black">用户管理</h2>
        
        <div className="flex gap-3">
          {/* 搜索 */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light" />
            <input
              type="text"
              placeholder="搜索用户..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-paper-white border border-paper-aged rounded-sm focus:outline-none focus:border-ink-medium"
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
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">用户</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">邮箱</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">角色</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">状态</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink-medium">注册时间</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-ink-medium">操作</th>
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
                      <span className={`px-2 py-1 text-xs rounded-sm ${user.role === 'admin' ? 'bg-vermilion/10 text-vermilion' : 'bg-cyan-ink/10 text-cyan-ink'}`}>
                        {user.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-sm ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? '正常' : '禁用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-light">
                      {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className={`p-2 rounded-sm transition-colors ${user.is_active ? 'hover:bg-yellow-100 text-yellow-600' : 'hover:bg-green-100 text-green-600'}`}
                          onClick={() => handleToggleStatus(user)}
                          title={user.is_active ? '禁用' : '启用'}
                        >
                          {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                        <button
                          className="p-2 rounded-sm hover:bg-red-100 text-red-600 transition-colors"
                          onClick={() => {
                            setSelectedUser(user)
                            setShowDeleteModal(true)
                          }}
                          title="删除"
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
            暂无用户数据
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="确认删除"
      >
        <p className="text-ink-medium mb-6">
          确定要删除用户 <span className="font-medium text-ink-black">{selectedUser?.username}</span> 吗？
          此操作不可撤销。
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            取消
          </Button>
          <Button
            variant="seal"
            onClick={handleDeleteUser}
            loading={actionLoading}
          >
            确认删除
          </Button>
        </div>
      </Modal>
    </div>
  )
}
