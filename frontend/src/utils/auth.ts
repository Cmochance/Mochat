/**
 * 清除本地认证信息并跳转到登录页
 */
export const clearAuthAndRedirect = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  localStorage.removeItem('auth-storage')
  if (window.location.pathname !== '/auth/login') {
    window.location.href = '/auth/login'
  }
}
