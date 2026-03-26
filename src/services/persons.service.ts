import * as personsRepository from "../repositories/persons.repository.ts";
import type {
    CreatePersonBody,
    GenderHint,
    RelationshipType,
    StoredPerson,
} from "../types/index.ts";
import { AppError } from "../utils/index.ts";

const RELATIONSHIP_TYPES: RelationshipType[] = [
    "boss",
    "coworker",
    "lover",
    "family",
    "friend",
    "classmate",
    "customer",
    "other",
];

const GENDER_HINTS: GenderHint[] = ["male", "female", "other", "unknown"];

// Person 作成の service です。
// controller から受け取った body を検証し、session とひも付けて repository に保存します。
export async function createPerson(sessionId: string, data: CreatePersonBody) {
    if (!sessionId) {
        throw new AppError({
            code: "SESSION_INVALID",
            message: "x-session-id is required",
            status: 401,
        });
    }

    const displayName = String(data?.displayName ?? "").trim();
    const relationshipType = data?.relationshipType;
    const ageRange = String(data?.ageRange ?? "").trim();
    const genderHint = (data?.genderHint ?? "unknown") as GenderHint;
    const notes = String(data?.notes ?? "").trim();

    if (!displayName || displayName.length > 50) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "displayName は 1〜50 文字で指定してください。",
            status: 422,
        });
    }

    if (!RELATIONSHIP_TYPES.includes(relationshipType)) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "relationshipType が不正です。",
            status: 422,
        });
    }

    if (!GENDER_HINTS.includes(genderHint)) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "genderHint が不正です。",
            status: 422,
        });
    }

    if (notes.length > 1000) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "notes は 1000 文字以内で指定してください。",
            status: 422,
        });
    }

    const person = await personsRepository.create({
        sessionId,
        displayName,
        relationshipType,
        ageRange,
        genderHint,
        notes,
    });

    return { person };
}

// personId の存在確認と session 所有確認を共通化します。
// analysisCases 側からも使えるように service として公開します。
export async function getOwnedPersonOrThrow(
    sessionId: string,
    personId: string,
): Promise<StoredPerson> {
    if (!sessionId) {
        throw new AppError({
            code: "SESSION_INVALID",
            message: "x-session-id is required",
            status: 401,
        });
    }

    const person = await personsRepository.findById(personId);

    if (!person) {
        throw new AppError({
            code: "NOT_FOUND",
            message: "person が見つかりません。",
            status: 404,
        });
    }

    if (person.sessionId !== sessionId) {
        throw new AppError({
            code: "FORBIDDEN",
            message: "この person にはアクセスできません。",
            status: 403,
        });
    }

    return person;
}
