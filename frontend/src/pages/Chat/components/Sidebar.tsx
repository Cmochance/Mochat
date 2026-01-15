import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MessageSquare, Trash2, LogOut, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { getCurrentVersion, VersionModal, getVersionInfo, type VersionInfo } from '@upgrade'
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

// 水墨风格的切换按钮图标
function InkToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      className="transition-transform duration-300"
      style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}
    >
      {/* 水墨风格的三横线，收起时变为箭头 */}
      <path
        d={isOpen 
          ? "M4 6h16M4 12h12M4 18h8"  // 展开：递减的三条线
          : "M9 6l6 6-6 6"             // 收起：向右箭头
        }
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />
      {/* 装饰性的墨点 */}
      {isOpen && (
        <circle cx="20" cy="18" r="1.5" fill="currentColor" opacity="0.6" />
      )}
    </svg>
  )
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
  
  // 检测是否为大屏幕 - 大屏幕不需要遮罩层
  const [isLargeScreen, setIsLargeScreen] = useState(true)
  
  // 当前版本号
  const [version, setVersion] = useState('v1.5')
  
  // 版本弹窗状态
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // 获取当前版本号
  useEffect(() => {
    getCurrentVersion('/upgrade').then(setVersion)
  }, [])

  // 点击版本号显示弹窗
  const handleVersionClick = async () => {
    try {
      const info = await getVersionInfo('/upgrade')
      setVersionInfo(info)
      setShowVersionModal(true)
    } catch (error) {
      console.error('获取版本信息失败:', error)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <>
      {/* 版本弹窗 */}
      {showVersionModal && (
        <VersionModal 
          versionInfo={versionInfo} 
          onClose={() => setShowVersionModal(false)} 
        />
      )}

      {/* 移动端遮罩 - 只在小屏幕且侧边栏打开时渲染 */}
      <AnimatePresence>
        {isOpen && !isLargeScreen && (
          <motion.div
            className="fixed inset-0 bg-ink-black/50 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* 侧边栏容器 */}
      <div className="fixed lg:relative z-30 h-full flex">
        {/* 迷你侧边栏 - 收起时显示 */}
        <motion.div
          className={`
            h-full bg-ink-dark text-paper-white flex flex-col items-center
            transition-all duration-300 overflow-hidden
            ${isOpen ? 'w-0 opacity-0' : 'w-16 opacity-100'}
          `}
        >
          {/* 展开按钮 */}
          <motion.button
            className="mt-4 p-3 hover:bg-ink-medium rounded-sm transition-colors"
            onClick={onToggle}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            title="展开侧边栏"
          >
            <InkToggleIcon isOpen={false} />
          </motion.button>

          {/* 新建对话快捷按钮 */}
          <motion.button
            className="mt-4 p-3 hover:bg-paper-white/10 rounded-sm transition-colors"
            onClick={onNewSession}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            title="新建对话"
          >
            <Plus size={20} />
          </motion.button>

          {/* 弹性空间 */}
          <div className="flex-1" />

          {/* 底部用户头像 */}
          <div className="mb-4 flex flex-col items-center gap-3">
            {user?.role === 'admin' && (
              <motion.button
                className="p-2 hover:bg-paper-white/10 rounded-sm transition-colors"
                onClick={() => navigate('/admin')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title="管理后台"
              >
                <Settings size={18} className="text-paper-cream/70" />
              </motion.button>
            )}
            <motion.button
              className="w-10 h-10 rounded-full bg-cyan-ink flex items-center justify-center cursor-pointer"
              onClick={handleLogout}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              title={`${username} - 点击登出`}
            >
              <span className="text-paper-white font-body">
                {username.charAt(0).toUpperCase()}
              </span>
            </motion.button>
          </div>
        </motion.div>

        {/* 完整侧边栏 - 展开时显示 */}
        <motion.aside
          className={`
            h-full bg-ink-dark text-paper-white flex flex-col
            transition-all duration-300 overflow-hidden
            ${isOpen ? 'w-72' : 'w-0'}
            ${!isOpen && !isLargeScreen ? '-translate-x-full' : 'translate-x-0'}
          `}
        >
          {/* 头部 */}
          <div className="p-4 border-b border-ink-medium flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-paper-white flex items-center justify-center">
                <span className="text-ink-black font-title text-xl">墨</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-title leading-tight whitespace-nowrap">墨语</span>
                <button
                  onClick={handleVersionClick}
                  className="text-xs text-paper-cream/60 hover:text-cyan-ink transition-colors text-left"
                  title="查看版本历史"
                >
                  {version}
                </button>
              </div>
            </div>
            {/* 水墨风格的收起按钮 - 始终显示 */}
            <motion.button
              className="p-2 hover:bg-ink-medium rounded-sm transition-colors"
              onClick={onToggle}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              title="收起侧边栏"
            >
              <InkToggleIcon isOpen={true} />
            </motion.button>
          </div>

          {/* 新建对话按钮 */}
          <div className="p-4 shrink-0">
            <motion.button
              className="w-full py-3 px-4 bg-paper-white/10 hover:bg-paper-white/20 rounded-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              onClick={onNewSession}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus size={20} />
              新建对话
            </motion.button>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto px-2 min-h-0">
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
              <div className="text-center py-8 text-paper-cream/50 text-sm whitespace-nowrap">
                暂无对话记录
              </div>
            )}
          </div>

          {/* 底部用户区 */}
          <div className="p-4 border-t border-ink-medium shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-cyan-ink flex items-center justify-center shrink-0">
                <span className="text-paper-white font-body">
                  {username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{username}</p>
                <p className="text-xs text-paper-cream/60 whitespace-nowrap">
                  {user?.role === 'admin' ? '管理员' : '用户'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {user?.role === 'admin' && (
                <motion.button
                  className="flex-1 py-2 px-3 bg-paper-white/10 hover:bg-paper-white/20 rounded-sm flex items-center justify-center gap-2 text-sm transition-colors whitespace-nowrap"
                  onClick={() => navigate('/admin')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Settings size={16} />
                  管理
                </motion.button>
              )}
              <motion.button
                className="flex-1 py-2 px-3 bg-vermilion/20 hover:bg-vermilion/30 rounded-sm flex items-center justify-center gap-2 text-sm text-vermilion-light transition-colors whitespace-nowrap"
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
      </div>
    </>
  )
}
