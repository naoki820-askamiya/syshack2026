/**
 * このファイルは persons の service です。
 *
 * Person に関する実際の処理の流れをここへまとめています。
 * 今は主に次の 2 つを担当しています。
 * - Person を作る
 * - personId が実在するか、同じ session の持ち物か確認する
 */
import * as personsRepository from "../repositories/persons.repository.js";
import type {
    CreatePersonBody,
    GenderHint,
    RelationshipType,
    StoredPerson,
} from "../types/index.js";
import { AppError} from "../utils/index.js";

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

// 許可する genderHint の候補です。
// body の値がこの中に入っているかを確認するために使います。
const GENDER_HINTS: GenderHint[] = ["male", "female", "other", "unknown"];

/**
 * Person 作成の service です。
 *
 * 受け取るもの:
 * - sessionId
 * - Person 作成用の body
 *
 * 返すもの:
 * - 作成された person
 *
 * ここでは validation（入力チェック）も一緒に行います。
 * controller には「HTTP の整理」だけを持たせたいので、
 * 値の意味に関するチェックは service 側でしています。
 */
export async function createPerson(userId: string, data: CreatePersonBody) {
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

    const normalizedAgeRange = normalizeOptionalText(ageRange);
    const normalizedNotes = normalizeOptionalText(notes);
    // repository は実際の保存担当です。
    // service は「どの値を保存するか」を決めて渡します。
    const person = await personsRepository.create({
        userId,
        displayName,
        relationshipType,
        ageRange: normalizedAgeRange,
        genderHint,
        notes: normalizedNotes,
    });

    return { person };
}

/**
 * personId の存在確認と session 所有確認を行う共通関数です。
 *
 * analysisCases 側でも同じ確認が必要なので、
 * ここで共通化して再利用しています。
 */
export async function getOwnedPersonOrThrow(
    userId : string,
    personId: string
): Promise<StoredPerson> {

    const person = await personsRepository.findById(userId, personId);

    if (!person) {
        throw new AppError({
            code: "NOT_FOUND",
            message: "person が見つかりません。",
            status: 404,
        });
    }

    return person;
}

function normalizeOptionalText(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();

    return trimmed ? trimmed : null;
}
