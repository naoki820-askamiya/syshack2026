import type { ConsultationData } from '../types.js';
import type { AuthBoundary } from './authBoundary.js';

export interface HomeHistoryState {
  boundary: AuthBoundary;
  status: 'loading' | 'loaded' | 'error';
  consultations: ConsultationData[];
  error: string;
}

export function visibleHomeHistory(state: HomeHistoryState, boundary: AuthBoundary): HomeHistoryState {
  return state.boundary.userId === boundary.userId && state.boundary.epoch === boundary.epoch
    ? state : { boundary, status: 'loading', consultations: [], error: '' };
}

export function recentConsultations(consultations: ConsultationData[]): ConsultationData[] {
  return [...consultations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
}
