import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage    from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SuperAdminPage from './pages/SuperAdminPage'
import { getAuthRole } from './services/api'

function PrivateRoute({ children, role = null }) {
  const token = localStorage.getItem('authToken')
  const authRole = getAuthRole()

  if (!token) return <Navigate to="/login" replace />
  if (role && authRole !== role) {
    return <Navigate to={authRole === 'superadmin' ? '/superadmin' : '/dashboard'} replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"     element={<LoginPage />} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/superadmin" element={<PrivateRoute role="superadmin"><SuperAdminPage /></PrivateRoute>} />
      <Route path="*"          element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
