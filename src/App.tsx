import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { useT } from '@/i18n/useT'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequireAccess } from '@/components/auth/RequireAccess'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { OfflineBanner } from '@/components/layout/OfflineBanner'
import { CookieBanner } from '@/components/layout/CookieBanner'
import { Toaster } from '@/components/ui/toaster'
import { LoginPage } from '@/pages/LoginPage'
import { ActivationPage } from '@/pages/ActivationPage'
import { ConsentPage } from '@/pages/ConsentPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { ResetPasswordConfirmPage } from '@/pages/ResetPasswordConfirmPage'
import { ResetPasswordSuccessPage } from '@/pages/ResetPasswordSuccessPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { QuestionnairePage } from '@/pages/QuestionnairePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AccessPage } from '@/pages/AccessPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { PartnerDashboardPage } from '@/pages/PartnerDashboardPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { ErrorPage } from '@/pages/errors/ErrorPage'
import { MaintenancePage } from '@/pages/errors/MaintenancePage'

// Pages légales bêta (contenu : t.legalPages, valeurs relues en L7). Publiques.
// `LanguageProvider` doit envelopper `AuthProvider` (et non l'inverse) pour que useAuth.ts
// puisse résoudre la langue active via useT() dans son propre corps de composant (toast de
// session expirée).
function LegalContentPage({ page }: { page: 'legal' | 'security' }) {
  const t = useT()
  const content = t.legalPages[page]
  return (
    <div className="min-h-screen bg-bg px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p role="note" className="mb-6 rounded-2xl border border-warning/40 bg-warning-light px-4 py-3 text-sm text-text-secondary">
          {t.legalPages.betaBanner}
        </p>
        <h1 className="mb-8 font-display text-3xl font-normal text-text">{content.title}</h1>
        {content.blocks.map((block) => (
          <section key={block.heading} className="mb-8">
            <h2 className="mb-2 font-display text-xl font-normal text-text">{block.heading}</h2>
            {block.body.split('\n\n').map((paragraph, index) => (
              <p key={index} className="mb-3 text-text-secondary">{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <OfflineBanner />

            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              {/* Plus d'inscription publique en v2 : l'accès famille s'ouvre par invitation de la PF. */}
              <Route path="/signup" element={<Navigate to="/login" replace />} />
              {/* Activation famille : PUBLIQUE (le compte n'existe pas encore) — le jeton vient du fragment #t=. */}
              <Route path="/activation" element={<ActivationPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/reset-password/confirm" element={<ResetPasswordConfirmPage />} />
              <Route path="/reset-password/success" element={<ResetPasswordSuccessPage />} />
              <Route path="/legal" element={<LegalContentPage page="legal" />} />
              <Route path="/security" element={<LegalContentPage page="security" />} />

              {/* Error routes */}
              <Route path="/erreur" element={<ErrorPage />} />
              <Route path="/maintenance" element={<MaintenancePage />} />

              {/* Protected routes */}
              {/* Consentement : seule route famille ouverte tant que les 3 accords manquent. */}
              <Route path="/bienvenue" element={<ProtectedRoute><RequireAccess area="consent"><ConsentPage /></RequireAccess></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><RequireAccess area="family"><QuestionnairePage /></RequireAccess></ProtectedRoute>} />
              <Route path="/access" element={<ProtectedRoute><AccessPage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><RequireAccess area="family"><DashboardPage /></RequireAccess></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><RequireAccess area="family"><ProfilePage /></RequireAccess></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><RequireAccess area="family"><DocumentsPage /></RequireAccess></ProtectedRoute>} />
              {/* Espace partenaire PF : réservé aux comptes partner_users (garde + RPC côté serveur). */}
              <Route path="/partenaire" element={<ProtectedRoute><RequireAccess area="partner"><PartnerDashboardPage /></RequireAccess></ProtectedRoute>} />
              {/* v2:route-admin */}

              {/* 404 catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>

            <CookieBanner />
            <Toaster />
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
