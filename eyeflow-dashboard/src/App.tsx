import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

// ── Auth ──────────────────────────────────────────────────────────────────────
const LoginPage          = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage       = lazy(() => import('@/pages/auth/RegisterPage'));
const VerifyEmailPage    = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const GoogleCallbackPage = lazy(() => import('@/pages/auth/GoogleCallbackPage'));

// ── Protected ─────────────────────────────────────────────────────────────────
const DashboardPage      = lazy(() => import('@/pages/DashboardPage'));
const PreferencesPage    = lazy(() => import('@/pages/PreferencesPage'));

// ── 9 pillar pages ────────────────────────────────────────────────────────────
const EventsPage         = lazy(() => import('@/pages/EventsPage'));
const AnalysisPage       = lazy(() => import('@/pages/AnalysisPage'));
const DataExplorerPage   = lazy(() => import('@/pages/DataExplorerPage'));
const SuggestionsPage    = lazy(() => import('@/pages/SuggestionsPage'));
const AutomationsPage    = lazy(() => import('@/pages/AutomationsPage'));
const ExecutionPage      = lazy(() => import('@/pages/ExecutionPage'));
const SecurityPage       = lazy(() => import('@/pages/SecurityPage'));
const AuditPage          = lazy(() => import('@/pages/AuditPage'));
const ConfigurationPage  = lazy(() => import('@/pages/ConfigurationPage'));
const AdminPage          = lazy(() => import('@/pages/AdminPage'));

const Loading = () => (
  <div className="flex items-center justify-center h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* ── Public ────────────────────────────────────────────── */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/auth/callback"   element={<GoogleCallbackPage />} />

          {/* ── Protected ─────────────────────────────────────────── */}
          <Route element={<AppLayout />}>
            {/* Core */}
            <Route path="/dashboard"      element={<DashboardPage />} />
            <Route path="/preferences"    element={<PreferencesPage />} />

            {/* Pillar 1 — Observer */}
            <Route path="/events"         element={<EventsPage />} />

            {/* Pillar 2 — Analyser & Décider */}
            <Route path="/analysis"       element={<AnalysisPage />} />
            <Route path="/data-explorer"  element={<DataExplorerPage />} />
            <Route path="/suggestions"    element={<SuggestionsPage />} />
            <Route path="/automations"    element={<AutomationsPage />} />

            {/* Pillar 3 — Agir & Auditer */}
            <Route path="/execution"      element={<ExecutionPage />} />
            <Route path="/audit"          element={<AuditPage />} />

            {/* Pillar 4 — Gérer */}
            <Route path="/security"       element={<SecurityPage />} />
            <Route path="/configuration"  element={<ConfigurationPage />} />

            {/* Admin */}
            <Route path="/administration" element={<AdminPage />} />

            {/* Legacy aliases — keep old URLs working */}
            <Route path="/rules"          element={<Navigate to="/automations"    replace />} />
            <Route path="/connectors"     element={<Navigate to="/configuration"  replace />} />
            <Route path="/llm-config"     element={<Navigate to="/configuration"  replace />} />
            <Route path="/nodes"          element={<Navigate to="/configuration"  replace />} />
            <Route path="/agents"         element={<Navigate to="/execution"       replace />} />
            <Route path="/monitoring"     element={<Navigate to="/administration"  replace />} />
            <Route path="/admin/users"    element={<Navigate to="/security"        replace />} />
            <Route path="/admin/settings" element={<Navigate to="/configuration"  replace />} />
            <Route path="/projects"       element={<Navigate to="/automations"    replace />} />
          </Route>

          {/* ── Fallback ──────────────────────────────────────────── */}
          <Route path="/"  element={<Navigate to="/dashboard" replace />} />
          <Route path="*"  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
