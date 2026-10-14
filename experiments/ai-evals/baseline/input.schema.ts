import { z } from "zod";

const boundedText = (minimum: number, maximum: number) =>
    z.string().trim().min(minimum).max(maximum);

export const aiCurrentCaseSchema = z
    .object({
        userAgeRange: boundedText(1, 20),
        userGender: boundedText(1, 20),
        perceivedPartnerReaction: boundedText(1, 30),
        elapsedTimeType: boundedText(1, 30),
        eventFacts: boundedText(1, 3000),
        userResponseType: z.enum(["action", "conversation", "none"]),
        userResponseText: z.string().trim().min(1).max(3000).nullable(),
    })
    .strict()
    .superRefine((value, context) => {
        if (value.userResponseType === "none" && value.userResponseText !== null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["userResponseText"],
                message: "none の場合は null である必要があります。",
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

export const aiPersonContextSchema = z
    .object({
        displayName: boundedText(1, 50),
        relationshipType: boundedText(1, 30),
    })
    .strict();

const recentCaseSummarySchema = z
    .object({
        analysisCaseId: z.string().uuid(),
        summary: boundedText(1, 500),
    })
    .strict();

const recentFeedbackSchema = z
    .object({
        feedbackId: z.string().uuid(),
        actualOutcome: z.string().trim().max(50).nullable(),
        overreadScore: z.number().int().min(1).max(5).nullable(),
        outcomeNote: z.string().trim().max(500).nullable(),
    })
    .strict();

export const referenceContextSchema = z
    .object({
        personProfile: z.unknown().nullable(),
        userPatternSummary: z.null(),
        recentCaseSummaries: z.array(recentCaseSummarySchema).max(3),
        recentFeedbacks: z.array(recentFeedbackSchema).max(3),
    })
    .strict();

export const aiAnalysisInputSchema = z
    .object({
        referenceContext: referenceContextSchema,
        untrustedUserInput: z
            .object({
                person: aiPersonContextSchema,
                currentCase: aiCurrentCaseSchema,
            })
            .strict(),
    })
    .strict();

export type AiCurrentCase = z.infer<typeof aiCurrentCaseSchema>;
export type AiPersonContext = z.infer<typeof aiPersonContextSchema>;
export type ReferenceContext = z.infer<typeof referenceContextSchema>;
export type AiAnalysisInput = z.infer<typeof aiAnalysisInputSchema>;
