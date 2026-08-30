import { prisma } from "../prisma/client.js";
import type { RelationshipType } from "../generated/prisma/enums.js";

export async function createPerson(
    userId: string,
    data: { displayName: string; relationshipType: RelationshipType; notes?: string | null },
) {
    return prisma.person.create({
        data: {
            userId,
            displayName: data.displayName,
            relationshipType: data.relationshipType,
            notes: data.notes ?? null,
        },
    });
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
    // 読み取り後の更新に分けると競合できるため、所有権と未archive条件を更新自体に課します。
    const result = await prisma.person.updateMany({
        where: { id: personId, userId, archivedAt: null },
        data,
    });
    return result.count === 1 ? findOwnedPerson(userId, personId) : null;
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
