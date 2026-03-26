import type { StoredPerson } from "../types/index.ts";

// Person はセッションごとに分離して保持します。
// 今回は既存構成に合わせて、最小構成のインメモリ保存です。
const persons = new Map<string, StoredPerson>();

export async function create(
    input: Omit<StoredPerson, "id" | "createdAt" | "updatedAt">,
): Promise<StoredPerson> {
    const now = new Date().toISOString();
    const created: StoredPerson = {
        id: `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
        ...input,
    };

    persons.set(created.id, created);
    return created;
}

export async function findById(personId: string): Promise<StoredPerson | null> {
    return persons.get(personId) ?? null;
}
