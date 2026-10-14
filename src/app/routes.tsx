import { createBrowserRouter } from 'react-router';
import { Home } from './pages/Home';
import { NewConsultation } from './pages/NewConsultation';
import { AnalysisV17 } from './pages/AnalysisV17';
import { ActionSuggestionV17 } from './pages/ActionSuggestionV17';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ProtectedPlaceholder } from './pages/ProtectedPlaceholder';
import { PrivacySettingsV17 } from './pages/PrivacySettingsV17';
import { LegalDocument } from './pages/LegalDocument';
import { Consent } from './pages/Consent';
import { RequireConsent } from './components/RequireConsent';

export const router = createBrowserRouter([
  { path: '/terms', element: <LegalDocument kind="terms" /> },
  { path: '/privacy-policy', element: <LegalDocument kind="privacy" /> },
  { path: '/consent', element: <ProtectedRoute><Consent /></ProtectedRoute> },
  {
    path: '/',
    Component: Home,
  },
  {
    path: '/new',
    element: (
      <ProtectedRoute>
        <RequireConsent><NewConsultation /></RequireConsent>
      </ProtectedRoute>
    ),
  },
  {
    path: '/analysis/:id',
    element: (
      <ProtectedRoute>
        <AnalysisV17 />
      </ProtectedRoute>
    ),
  },
  {
    path: '/action/:id',
    element: (
      <ProtectedRoute>
        <ActionSuggestionV17 />
      </ProtectedRoute>
    ),
  },
  {
    path: '/history',
    element: (
      <ProtectedRoute>
        <History />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/register',
    Component: Register,
  },
  {
    path: '/signup',
    Component: Register,
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
  },
  {
    path: '/persons',
    element: (
      <ProtectedRoute>
        <History />
      </ProtectedRoute>
    ),
  },
  {
    path: '/persons/:personId',
    element: (
      <ProtectedRoute>
        <History />
      </ProtectedRoute>
    ),
  },
  {
    path: '/analysis-cases/:caseId',
    element: (
      <ProtectedRoute>
        <AnalysisV17 />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <ProtectedPlaceholder title="設定" />
      </ProtectedRoute>
    ),
  },
  {
    path: '/privacy-settings',
    element: (
      <ProtectedRoute>
        <PrivacySettingsV17 />
      </ProtectedRoute>
    ),
  },
]);
