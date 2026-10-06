import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import QuizEditor from './pages/teacher/QuizEditor'
import QuizResults from './pages/teacher/QuizResults'
import AdminDashboard from './pages/admin/AdminDashboard'
import HostView from './pages/game/HostView'
import StudentPlay from './pages/student/StudentPlay'
import SurveyHost from './pages/survey/SurveyHost'
import SurveyPlay from './pages/survey/SurveyPlay'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'

function RequireAuth({ role, children }: { role?: 'admin' | 'teacher'; children: React.ReactElement }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>
  if (!user || !profile) return <Navigate to="/login" replace />
  if (role && profile.role !== role && profile.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { profile, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={
        profile ? <Navigate to={profile.role === 'admin' ? '/admin' : '/teacher'} replace /> : <LoginPage />
      } />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Teacher routes */}
      <Route path="/teacher" element={<RequireAuth><TeacherDashboard /></RequireAuth>} />
      <Route path="/teacher/quiz/:id/edit" element={<RequireAuth><QuizEditor /></RequireAuth>} />
      <Route path="/teacher/quiz/new" element={<RequireAuth><QuizEditor /></RequireAuth>} />
      <Route path="/teacher/quiz/:quizId/results" element={<RequireAuth><QuizResults /></RequireAuth>} />

      {/* Admin routes */}
      <Route path="/admin" element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>} />

      {/* Game routes */}
      <Route path="/game/:sessionId/host" element={<RequireAuth><HostView /></RequireAuth>} />
      <Route path="/game/:sessionId/play" element={<StudentPlay />} />

      {/* Survey routes */}
      <Route path="/survey/:sessionId/host" element={<RequireAuth><SurveyHost /></RequireAuth>} />
      <Route path="/survey/:sessionId/play" element={<SurveyPlay />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
