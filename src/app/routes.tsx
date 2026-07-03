import { createBrowserRouter } from 'react-router';
import { Home } from './pages/Home';
import { NewConsultation } from './pages/NewConsultation';
import { Analysis } from './pages/Analysis';
import { ActionSuggestion } from './pages/ActionSuggestion';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ProtectedPlaceholder } from './pages/ProtectedPlaceholder';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Home,
  },
  {
    path: '/new',
    element: (
      <ProtectedRoute>
        <NewConsultation />
      </ProtectedRoute>
    ),
  },
  {
    path: '/analysis/:id',
    element: (
      <ProtectedRoute>
        <Analysis />
      </ProtectedRoute>
    ),
  },
  {
    path: '/action/:id',
    element: (
      <ProtectedRoute>
        <ActionSuggestion />
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
        <Analysis />
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
        <ProtectedPlaceholder title="プライバシー設定" />
      </ProtectedRoute>
    ),
  },
]);
