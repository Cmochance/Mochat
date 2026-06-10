import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuthStore } from './stores/authStore'
import { isDesktop } from './utils/env'
import Welcome from './pages/Welcome'
import Auth from './pages/Auth'
import Chat from './pages/Chat'
import Learn from './pages/Learn'
import Admin from './pages/Admin'
import Setup from './pages/Setup'

// 使用静态导入，避免部分环境下路由懒加载 chunk 导入失败导致空白页

// 管理员路由保护
function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  
  if (!isAuthenticated) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/auth/login?redirect=${redirect}`} replace />
  }
  
  if (user?.role !== 'admin') {
    return <Navigate to="/chat" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 欢迎页 */}
        <Route path="/" element={<Welcome />} />
        
        {/* 桌面端首次设置 */}
        {isDesktop() && (
          <Route path="/setup" element={<Setup onComplete={async (config) => {
            await (window as any).electronAPI?.saveSetup(config)
          }} />} />
        )}

        {/* 认证页面 */}
        <Route path="/auth/*" element={<Auth />} />
        
        {/* 对话页面 */}
        <Route path="/chat/*" element={<Chat />} />

        {/* 学习页面 */}
        <Route path="/learn/*" element={<Learn />} />
        
        {/* 管理页面 - 需要管理员权限 */}
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
        
        {/* 404重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
