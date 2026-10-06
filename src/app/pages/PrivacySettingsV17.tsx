import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getPrivacySettings, updatePrivacySettings, type PrivacySettings } from '../api/preferencesV17';
import { Navigation } from '../components/Navigation';
import { saveLoadedPrivacySettings } from '../utils/privacySettingsModel';

export function PrivacySettingsV17() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSettings(null);
    setLoadError('');
    void getPrivacySettings()
      .then(({ settings: loaded }) => { if (active) setSettings(loaded); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : '設定を取得できませんでした。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  const save = async () => {
    if (loading || saving || !settings) return;
    setSaving(true);
    setMessage('');
    try {
      const { settings: saved } = await saveLoadedPrivacySettings(settings, updatePrivacySettings);
      setSettings(saved);
      setMessage('設定を保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      <div className="lg:ml-64 pb-24 lg:pb-8">
        <header className="border-b border-[#D9E1EA] bg-white p-4 lg:px-8">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="戻る" className="text-[#5B6573]"><ArrowLeft /></button>
            <h1 className="text-xl font-semibold">プライバシー設定</h1>
          </div>
        </header>
        <main className="analysis-reading mx-auto max-w-3xl space-y-5 p-4 lg:p-8">
          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-[#1F2A37]">分析のパーソナライズ</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#5B6573]">
              許可した過去の相談やFeedbackを、次回の状況整理の参考に使うか選べます。保存済みデータの削除設定ではありません。
            </p>
            {loading && <p role="status" className="mt-4 text-sm text-[#5B6573]">設定を読み込んでいます…</p>}
            {loadError && <div role="alert" className="mt-4 text-sm text-red-700"><p>{loadError}</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-2 font-medium underline">設定を再取得</button></div>}
            {settings && <div className="mt-5 space-y-4">
              <Toggle
                label="過去情報を分析に利用する"
                description="OFFの場合、今回の入力内容だけをAIへ渡します。"
                checked={settings.personalizationEnabled}
                disabled={loading || saving}
                onChange={(checked) => setSettings((current) => (current ? { ...current, personalizationEnabled: checked } : current))}
              />
              <Toggle
                label="相手ごとのProfileを利用する"
                description="長期傾向は事実や人格診断として扱いません。"
                checked={settings.usePersonProfile}
                disabled={loading || saving || !settings.personalizationEnabled}
                onChange={(checked) => setSettings((current) => (current ? { ...current, usePersonProfile: checked } : current))}
              />
              <Toggle
                label="許可済みFeedbackを利用する"
                description="Feedback側でも「次回分析に利用可」を選んだものだけが対象です。"
                checked={settings.useFeedbackForContext}
                disabled={loading || saving || !settings.personalizationEnabled}
                onChange={(checked) => setSettings((current) => (current ? { ...current, useFeedbackForContext: checked } : current))}
              />
              <div className="rounded-xl border border-[#D9E1EA] bg-[#F7F9FC] p-4 text-sm text-[#5B6573]">
                自分全体の傾向要約は、現在の分析には利用しません。
              </div>
            </div>}
          </section>
          {message && <p role="status" className="rounded-xl border border-[#D9E1EA] bg-white p-3 text-sm text-[#5B6573]">{message}</p>}
          <button
            onClick={() => void save()}
            disabled={loading || saving || !settings}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F4C81] py-4 font-semibold text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" />{saving ? '保存中…' : '設定を保存'}
          </button>
        </main>
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, disabled, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border border-[#D9E1EA] p-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span><span className="block text-sm font-medium text-[#1F2A37]">{label}</span><span className="mt-1 block text-xs text-[#5B6573]">{description}</span></span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 accent-[#0F4C81]" />
    </label>
  );
}
