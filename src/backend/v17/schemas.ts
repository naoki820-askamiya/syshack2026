import { z } from "zod";
import { PERSON_SNAPSHOT_SCHEMA_VERSION } from "../ai/v2/constants.js";

export const relationshipTypeSchema = z.enum([
    "boss",
    "coworker",
    "subordinate",
    "lover",
    "spouse",
    "friend",
    "family",
    "customer",
    "classmate",
    "other",
]);

export const createPersonSchema = z
    .object({
        displayName: z.string().trim().min(1).max(50),
        relationshipType: relationshipTypeSchema,
        notes: z.string().trim().min(1).max(1000).nullable().optional(),
    })
    .strict();

export const updatePersonSchema = createPersonSchema.partial();

export const createAnalysisCaseSchema = z
    .object({
        personId: z.string().uuid(),
        userAgeRange: z.string().trim().min(1).max(20),
        userGender: z.string().trim().min(1).max(20),
        perceivedPartnerReaction: z.string().trim().min(1).max(30),
        elapsedTimeType: z.string().trim().min(1).max(30),
        eventFacts: z.string().trim().min(1).max(3000),
        userResponseType: z.enum(["action", "conversation", "none"]),
        userResponseText: z.string().trim().min(1).max(3000).nullable(),
    })
    .strict()
    .superRefine((value, context) => {
        if (value.userResponseType === "none" && value.userResponseText !== null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["userResponseText"],
                message: "none の場合は null にしてください。",
            });
        }

        if (value.userResponseType !== "none" && value.userResponseText === null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["userResponseText"],
                message: "action/conversation の場合は本文が必要です。",
            });
        }
    });

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export function buildPersonSnapshot(person: {
    displayName: string;
    relationshipType: string;
}) {
    return {
        schemaVersion: PERSON_SNAPSHOT_SCHEMA_VERSION,
        capturedAt: new Date().toISOString(),
        person: {
            displayName: person.displayName,
            relationshipType: person.relationshipType,
        },
    };
}

export type CreateAnalysisCaseInput = z.infer<typeof createAnalysisCaseSchema>;
