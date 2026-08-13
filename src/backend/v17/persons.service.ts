import type { RelationshipType } from "../generated/prisma/enums.js";
import { AppError } from "../utils/index.js";
import { createPersonSchema, paginationSchema, updatePersonSchema } from "./schemas.js";
import { parseOrThrow } from "./http.js";
import * as repository from "./persons.repository.js";

export async function createPerson(userId: string, body: unknown) {
    const data = parseOrThrow(createPersonSchema, body);
    const person = await repository.createPerson(userId, {
        ...data,
        relationshipType: data.relationshipType as RelationshipType,
    });
    return { person };
}

export async function getPerson(userId: string, personId: string) {
    return { person: await getOwnedPersonOrThrow(userId, personId) };
}

export async function listPersons(userId: string, query: unknown) {
    const parsed = parseOrThrow(paginationSchema, query);
    const limit = parsed.limit ?? 20;
    const offset = parsed.offset ?? 0;
    const { persons, total } = await repository.listOwnedPersons(userId, limit, offset);
    return {
        persons,
        pagination: { limit, offset, hasMore: offset + persons.length < total },
    };
}

export async function updatePerson(userId: string, personId: string, body: unknown) {
    const data = parseOrThrow(updatePersonSchema, body);
    const person = await repository.updateOwnedPerson(userId, personId, {
        ...data,
        relationshipType: data.relationshipType as RelationshipType | undefined,
    });
    if (!person) throw notFound();
    return { person };
}

export async function getPersonProfile(userId: string, personId: string) {
    await getOwnedPersonOrThrow(userId, personId);
    const profile = await repository.findOwnedPersonProfile(userId, personId);
    return { profile };
}

export async function archivePerson(userId: string, personId: string) {
    if (!(await repository.archiveOwnedPerson(userId, personId))) throw notFound();
    return { archived: true };
}

export async function getOwnedPersonOrThrow(userId: string, personId: string) {
    const person = await repository.findOwnedPerson(userId, personId);
    if (!person) throw notFound();
    return person;
}

function notFound() {
    return new AppError({
        code: "RESOURCE_NOT_FOUND",
        message: "対象が見つかりません。",
        status: 404,
    });
}
