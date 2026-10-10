import { supabase } from '../auth/supabase';
import { createApiClient } from './clientRequest';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? (
  import.meta.env.DEV ? 'http://127.0.0.1:3000' : undefined
);

function requireServerUrl(): string {
  if (!serverUrl) throw new Error('VITE_SERVER_URL が未設定です');
  return serverUrl;
}

// Keep Supabase token retrieval, URL selection and fetch unchanged; this is protected I/O only.
const client = createApiClient({
  getSession: () => supabase.auth.getSession(),
  send: (endpoint, options) => fetch(`${requireServerUrl()}${endpoint}`, options),
});

export const fetchApi = client.fetchApi;
export const fetchApiJson = client.fetchApiJson;
export { StaleAuthResponseError } from './clientRequest';
