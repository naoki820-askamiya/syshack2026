import { prisma } from "../prisma/client.js";
import type { RelationshipType } from "../generated/prisma/enums.js";
import { assertSameCreateIntent, isCreateIntentCollision, personIntentFingerprint } from './createIntent.js';
import { resourceNotFound } from './http.js';

export async function createPerson(
    userId: string,
    data: { displayName: string; relationshipType: RelationshipType; notes?: string | null; createIntentKey?: string },
) {
    const intent = data.createIntentKey ? { createIntentKey: data.createIntentKey.toLowerCase(), createIntentFingerprint: personIntentFingerprint(data) } : {};
    try { return await prisma.person.create({
        data: {
            userId,
            displayName: data.displayName,
            relationshipType: data.relationshipType,
            notes: data.notes ?? null,
            ...intent,
        },
    }); } catch (error) {
        if (!intent.createIntentKey || !isCreateIntentCollision(error, 'persons')) throw error;
        const existing = await prisma.person.findFirst({ where: { userId, createIntentKey: intent.createIntentKey } });
        if (!existing || existing.archivedAt) throw resourceNotFound();
        assertSameCreateIntent(existing.createIntentFingerprint, intent.createIntentFingerprint!);
        return existing;
    }
}

export async function findOwnedPerson(userId: string, personId: string) {
    // 所有権は取得後に判定せずWHEREへ含め、他ユーザーの存在を応答差から漏らしません。
    return prisma.person.findFirst({
        where: { id: personId, userId, archivedAt: null },
    });
}

export async function listOwnedPersons(userId: string, limit: number, offset: number) {
    const [persons, total] = await prisma.$transaction([
        prisma.person.findMany({
            where: { userId, archivedAt: null },
            orderBy: { updatedAt: "desc" },
            take: limit,
            skip: offset,
        }),
        prisma.person.count({ where: { userId, archivedAt: null } }),
    ]);
    return { persons, total };
}

export async function updateOwnedPerson(
    userId: string,
    personId: string,
    data: Partial<{
        displayName: string;
        relationshipType: RelationshipType;
        notes: string | null;
    }>,
) {
    return prisma.$transaction(async tx => {
        // The UPDATE holds the Person row lock through invalidation and the response read.
        const result = await tx.person.updateMany({
            where: { id: personId, userId, archivedAt: null }, data,
        });
        if (result.count !== 1) return null;
        if (data.displayName !== undefined || data.relationshipType !== undefined) {
            // Independent of current privacy: a later ON must not reuse pre-edit derived context.
            await tx.personProfile.updateMany({
                where: { userId, personId }, data: { needsRefresh: true, staleSince: new Date() },
            });
        }
        return tx.person.findFirst({ where: { id: personId, userId, archivedAt: null } });
    });
}

export async function findOwnedPersonProfile(userId: string, personId: string) {
    return prisma.personProfile.findUnique({
        where: { userId_personId: { userId, personId } },
    });
}

export async function archiveOwnedPerson(userId: string, personId: string) {
    const result = await prisma.person.updateMany({
        where: { id: personId, userId, archivedAt: null },
        data: { archivedAt: new Date() },
    });
    return result.count === 1;
}
