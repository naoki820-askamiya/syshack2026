import { useCallback, useEffect, useRef, useState } from 'react';
import { captchaRequired, captchaSiteKey } from '../auth/captcha';
import { loadTurnstile, type Turnstile } from '../auth/turnstile';

export function useAuthCaptcha() {
  const token = useRef('');
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const onToken = useCallback((value: string) => { token.current = value; setReady(Boolean(value)); }, []);
  const takeToken = () => {
    const value = token.current;
    onToken('');
    return value || undefined;
  };
  const reset = () => { onToken(''); setGeneration(value => value + 1); };
  return { ready: !captchaRequired || ready, takeToken, reset, generation, onToken };
}

export function AuthCaptcha({ generation, onToken }: {
  generation: number; onToken: (value: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('bot 対策の確認中です…');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!captchaRequired || !captchaSiteKey) return;
    let active = true;
    let api: Turnstile | undefined;
    let widget: string | undefined;
    onToken('');
    setMessage('bot 対策の確認中です…');
    const invalidate = () => {
      if (!active) return;
      onToken('');
      setMessage('確認できませんでした。「確認をやり直す」を押してください。');
    };
    void loadTurnstile().then(loaded => {
      if (!active || !container.current) return;
      api = loaded;
      widget = loaded.render(container.current, {
        sitekey: captchaSiteKey, size: 'compact', theme: 'light',
        'response-field': false,
        callback: (value: string) => {
          if (!active) return;
          onToken(value);
          setMessage('確認が完了しました。');
        },
        'expired-callback': invalidate, 'error-callback': invalidate, 'timeout-callback': invalidate,
      });
    }).catch(invalidate);
    return () => {
      active = false;
      onToken('');
      if (api && widget !== undefined) api.remove(widget);
    };
  }, [generation, retry, onToken]);

  if (!captchaRequired) return null;
  if (!captchaSiteKey) return <p role="alert">bot 対策の設定が不足しています。管理者にお問い合わせください。</p>;
  return <section aria-label="bot 対策の確認" className="space-y-2">
    <div ref={container} />
    <p role="status" className="text-sm text-[#5B6573]">{message}</p>
    <button type="button" className="text-sm text-[#0F4C81] underline" onClick={() => {
      onToken(''); setRetry(value => value + 1);
    }}>確認をやり直す</button>
    <p className="text-xs text-[#5B6573]">不正利用の防止に Cloudflare Turnstile を使用します。
      <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer" className="underline">プライバシーポリシー</a>
    </p>
  </section>;
}
