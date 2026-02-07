import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Welcome from './pages/Welcome'
import Auth from './pages/Auth'
import Chat from './pages/Chat'
import Admin from './pages/Admin'

// 使用静态导入，避免部分环境下路由懒加载 chunk 导入失败导致空白页

// 路由保护组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }
  
  return <>{children}</>
}

// 管理员路由保护
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
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
        
        {/* 认证页面 */}
        <Route path="/auth/*" element={<Auth />} />
        
        {/* 对话页面 - 需要登录 */}
        <Route
          path="/chat/*"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        
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
