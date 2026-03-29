/** ページ遷移をまたいで展開状態を保持するシングルトンストア */
let expandedPerson: string | null = null;
const listeners = new Set<() => void>();

export function getExpandedPerson(): string | null {
  return expandedPerson;
}

export function setExpandedPerson(person: string | null): void {
  expandedPerson = person;
  listeners.forEach((l) => l());
}

export function subscribeExpandedPerson(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
