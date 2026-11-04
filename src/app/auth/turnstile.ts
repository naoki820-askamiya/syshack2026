export type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global { interface Window { turnstile?: Turnstile } }

let pending: Promise<Turnstile> | undefined;
export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (pending) return pending;
  pending = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else if (window.turnstile) resolve(window.turnstile);
      else { script.remove(); reject(new Error('Turnstile unavailable')); }
    };
    const timeout = window.setTimeout(() => finish(new Error('Turnstile timeout')), 15000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(new Error('Turnstile failed'));
    document.head.appendChild(script);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
