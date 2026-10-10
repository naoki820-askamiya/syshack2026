// Navigationは画面ごとに再マウントされるため、展開状態だけをモジュールスコープで共有します。
let expandedPerson: string | null = null;
const listeners = new Set<() => void>();

export function getExpandedPerson(): string | null {
  return expandedPerson;
}

export function setExpandedPerson(person: string | null): void {
  expandedPerson = person;
  listeners.forEach((listener) => listener());
}

export function subscribeExpandedPerson(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
