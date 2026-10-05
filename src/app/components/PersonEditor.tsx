import { useEffect, useRef, useState } from 'react';
import { fetchApiJson } from '../api/client';
import { relationshipLabel, type ApiPerson } from '../api/consultationMapper';
import { captureAuthBoundary, isCurrentAuthBoundary, assertCurrentAuthBoundary } from '../utils/authBoundary';

const relationships = ['boss', 'coworker', 'subordinate', 'lover', 'spouse', 'friend', 'family', 'customer', 'classmate', 'other'];

export function PersonEditor({ person, disabled, onSaved, onEditingChange }: {
  person: ApiPerson; disabled: boolean; onSaved: (person: ApiPerson) => void; onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: person.displayName, relationshipType: person.relationshipType });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const currentId = useRef(person.id);
  currentId.current = person.id;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);

  const finish = () => { setEditing(false); setError(''); onEditingChange(false); };
  const save = async () => {
    if (disabled || busy.current) return;
    const displayName = draft.displayName.trim();
    if (!displayName || displayName.length > 50 || !relationships.includes(draft.relationshipType)) {
      setError('ニックネームは1〜50文字で入力し、関係性を選んでください。'); return;
    }
    const boundary = captureAuthBoundary();
    const personId = person.id;
    const attempt = ++generation.current;
    const current = () => mounted.current && attempt === generation.current && currentId.current === personId && isCurrentAuthBoundary(boundary);
    busy.current = true; setSaving(true); setError('');
    try {
      assertCurrentAuthBoundary(boundary);
      const result = await fetchApiJson<{ person: ApiPerson }>(`/api/persons/${encodeURIComponent(personId)}`, {
        method: 'PATCH', body: JSON.stringify({ displayName, relationshipType: draft.relationshipType }),
      });
      if (!current()) return;
      if (result.person.id !== personId) throw new Error('保存した相手の情報を確認できませんでした。');
      onSaved(result.person); finish();
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : '相手の情報を保存できませんでした。');
    } finally {
      busy.current = false;
      if (current()) setSaving(false);
    }
  };

  if (!editing) return <button type="button" disabled={disabled} onClick={() => {
    if (disabled || busy.current) return;
    setDraft({ displayName: person.displayName, relationshipType: person.relationshipType });
    setEditing(true); setError(''); onEditingChange(true);
  }} className="mt-3 text-sm text-[#0F4C81] underline">相手の情報を編集</button>;

  return <fieldset disabled={disabled || saving} aria-busy={saving} className="mt-3 space-y-3 rounded-lg border p-3">
    <legend>相手の情報を編集</legend>
    <label htmlFor="edit-person-name">ニックネーム</label>
    <input id="edit-person-name" value={draft.displayName} maxLength={50} onChange={event => setDraft({ ...draft, displayName: event.target.value })} className="w-full rounded border p-2" />
    <label htmlFor="edit-person-relation">関係性</label>
    <select id="edit-person-relation" value={draft.relationshipType} onChange={event => setDraft({ ...draft, relationshipType: event.target.value })} className="w-full rounded border p-2">
      {relationships.map(value => <option key={value} value={value}>{value === 'customer' ? '顧客' : value === 'classmate' ? '同級生' : relationshipLabel(value)}</option>)}
    </select>
    <p className="text-sm">保存した情報は次の相談に使われます。過去の分析内容は変わりません。</p>
    {error && <p role="alert">{error}</p>}
    {saving && <p role="status">保存しています...</p>}
    <div className="flex gap-3">
      <button type="button" disabled={disabled || saving} onClick={() => void save()} className="rounded bg-[#0F4C81] px-3 py-2 text-white">相手の情報を保存</button>
      <button type="button" disabled={disabled || saving} onClick={() => { if (!busy.current) finish(); }} className="rounded border px-3 py-2">キャンセル</button>
    </div>
  </fieldset>;
}
