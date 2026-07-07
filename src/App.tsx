import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { OfflineBanner } from '@/components/layout/OfflineBanner'
import { CookieBanner } from '@/components/layout/CookieBanner'
import { Toaster } from '@/components/ui/toaster'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { ResetPasswordConfirmPage } from '@/pages/ResetPasswordConfirmPage'
import { ResetPasswordSuccessPage } from '@/pages/ResetPasswordSuccessPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { QuestionnairePage } from '@/pages/QuestionnairePage'
import { DemoPage } from '@/pages/DemoPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AccessPage } from '@/pages/AccessPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { ErrorPage } from '@/pages/errors/ErrorPage'
import { MaintenancePage } from '@/pages/errors/MaintenancePage'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <OfflineBanner />

          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/reset-password/confirm" element={<ResetPasswordConfirmPage />} />
            <Route path="/reset-password/success" element={<ResetPasswordSuccessPage />} />
            <Route path="/legal" element={<div className="min-h-screen bg-bg p-12 max-w-3xl mx-auto"><h1 className="font-display text-3xl text-accent mb-4">Conditions Generales d&apos;Utilisation</h1><p className="text-text-soft">Contenu a venir...</p></div>} />
            <Route path="/security" element={<div className="min-h-screen bg-bg p-12 max-w-3xl mx-auto"><h1 className="font-display text-3xl text-accent mb-4">Politique de confidentialite</h1><p className="text-text-soft">Contenu a venir...</p></div>} />

            {/* Error routes */}
            <Route path="/erreur" element={<ErrorPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />

            {/* Protected routes */}
            <Route path="/" element={<ProtectedRoute><QuestionnairePage /></ProtectedRoute>} />
            <Route path="/demo" element={<ProtectedRoute><DemoPage /></ProtectedRoute>} />
            <Route path="/access" element={<ProtectedRoute><AccessPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />

            {/* 404 catch-all */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>

          <CookieBanner />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
