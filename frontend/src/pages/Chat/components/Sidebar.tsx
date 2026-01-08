import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MessageSquare, Trash2, LogOut, Settings, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import type { ChatSession } from '../../../types'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  sessions: ChatSession[]
  currentSession: ChatSession | null
  onSelectSession: (session: ChatSession) => void
  onNewSession: () => void
  onDeleteSession: (id: number) => void
  username: string
}

export default function Sidebar({
  isOpen,
  onToggle,
  sessions,
  currentSession,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  username,
}: SidebarProps) {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <>
      {/* 移动端遮罩 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-ink-black/50 z-20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* 侧边栏 */}
      <motion.aside
        className={`
          fixed lg:relative z-30 h-full
          w-72 bg-ink-dark text-paper-white
          flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
          transition-transform lg:transition-all duration-300
        `}
      >
        {/* 头部 */}
        <div className="p-4 border-b border-ink-medium flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-paper-white flex items-center justify-center">
              <span className="text-ink-black font-title text-xl">墨</span>
            </div>
            <span className="text-xl font-title">墨聊</span>
          </div>
          <button
            className="lg:hidden p-2 hover:bg-ink-medium rounded-sm"
            onClick={onToggle}
          >
            <X size={20} />
          </button>
        </div>

        {/* 新建对话按钮 */}
        <div className="p-4">
          <motion.button
            className="w-full py-3 px-4 bg-paper-white/10 hover:bg-paper-white/20 rounded-sm flex items-center justify-center gap-2 transition-colors"
            onClick={onNewSession}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={20} />
            新建对话
          </motion.button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-2">
          <AnimatePresence>
            {sessions.map((session, index) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  group flex items-center gap-3 p-3 mb-1 rounded-sm cursor-pointer
                  ${currentSession?.id === session.id 
                    ? 'bg-paper-white/20' 
                    : 'hover:bg-paper-white/10'
                  }
                  transition-colors
                `}
                onClick={() => onSelectSession(session)}
              >
                <MessageSquare size={18} className="shrink-0 text-paper-cream/70" />
                <span className="flex-1 truncate text-sm">{session.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-vermilion/20 rounded transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSession(session.id)
                  }}
                >
                  <Trash2 size={14} className="text-vermilion-light" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {sessions.length === 0 && (
            <div className="text-center py-8 text-paper-cream/50 text-sm">
              暂无对话记录
            </div>
          )}
        </div>

        {/* 底部用户区 */}
        <div className="p-4 border-t border-ink-medium">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-cyan-ink flex items-center justify-center">
              <span className="text-paper-white font-body">
                {username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{username}</p>
              <p className="text-xs text-paper-cream/60">
                {user?.role === 'admin' ? '管理员' : '用户'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {user?.role === 'admin' && (
              <motion.button
                className="flex-1 py-2 px-3 bg-paper-white/10 hover:bg-paper-white/20 rounded-sm flex items-center justify-center gap-2 text-sm transition-colors"
                onClick={() => navigate('/admin')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Settings size={16} />
                管理
              </motion.button>
            )}
            <motion.button
              className="flex-1 py-2 px-3 bg-vermilion/20 hover:bg-vermilion/30 rounded-sm flex items-center justify-center gap-2 text-sm text-vermilion-light transition-colors"
              onClick={handleLogout}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <LogOut size={16} />
              登出
            </motion.button>
          </div>
        </div>
      </motion.aside>
    </>
  )
}
