import { createBrowserRouter } from 'react-router';
import { Home } from './pages/Home';
import { NewConsultation } from './pages/NewConsultation';
import { Analysis } from './pages/Analysis';
import { ActionSuggestion } from './pages/ActionSuggestion';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Home,
  },
  {
    path: '/new',
    Component: NewConsultation,
  },
  {
    path: '/analysis/:id',
    Component: Analysis,
  },
  {
    path: '/action/:id',
    Component: ActionSuggestion,
  },
  {
    path: '/history',
    Component: History,
  },
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/register',
    Component: Register,
  },
]);