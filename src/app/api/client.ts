import { supabase, serverUrl } from '../auth/supabase';
import { createApiClient } from './clientRequest';

// Cookies authenticate; only public identity/session binding crosses JavaScript.
const client = createApiClient({
  getSession: () => supabase.auth.getSession(),
  send: (endpoint, options) => fetch(`${serverUrl}${endpoint}`, options),
  onAuthFailure: () => { supabase.invalidate(); void supabase.revalidate(); },
});

export const fetchApi = client.fetchApi;
export const fetchApiJson = client.fetchApiJson;
export { StaleAuthResponseError } from './clientRequest';
