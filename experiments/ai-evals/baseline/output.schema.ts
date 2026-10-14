import { z } from "zod";
import { SCORE_DEFINITIONS } from "./constants.js";

const strengthSchema = z.enum(["low", "medium", "high"]);
const boundedText = (minimum: number, maximum: number) =>
    z.string().trim().min(minimum).max(maximum);

const evidenceItemSchema = z
    .object({
        text: boundedText(1, 300),
        source: z.enum(["current_case", "person_profile", "recent_case", "feedback"]),
        strength: strengthSchema,
    })
    .strict();

function scoreItemSchema<Key extends keyof typeof SCORE_DEFINITIONS>(key: Key) {
    const definition = SCORE_DEFINITIONS[key];
    return z
        .object({
            label: z.literal(definition.label),
            score: z.number().int().min(0).max(100),
            category: z.literal(definition.category),
            reason: boundedText(10, 300),
        })
        .strict();
}

export const kigenAnalysisResultV2Schema = z
    .object({
        confidenceLevel: strengthSchema,
        summary: z.object({ oneLine: boundedText(20, 180) }).strict(),
        textImpression: z.object({ body: boundedText(20, 500) }).strict(),
        situationReading: z.object({ body: boundedText(20, 700) }).strict(),
        emotionScoreAnalysis: z
            .object({
                description: boundedText(10, 500),
                scores: z
                    .object({
                        anger: scoreItemSchema("anger"),
                        coldness: scoreItemSchema("coldness"),
                        distance: scoreItemSchema("distance"),
                        busyness: scoreItemSchema("busyness"),
                        flatness: scoreItemSchema("flatness"),
                        reassurance: scoreItemSchema("reassurance"),
                    })
                    .strict(),
            })
            .strict(),
        evidence: z
            .object({
                signalsForConcern: z.array(evidenceItemSchema).max(4),
                signalsAgainstConcern: z.array(evidenceItemSchema).min(1).max(4),
                unknowns: z.array(boundedText(1, 300)).max(4),
            })
            .strict(),
        alternativeInterpretations: z
            .array(
                z
                    .object({
                        label: boundedText(1, 100),
                        reason: boundedText(10, 300),
                    })
                    .strict(),
            )
            .min(1)
            .max(4),
        cognitiveReframe: z
            .object({
                possibleBiases: z
                    .array(
                        z
                            .object({
                                label: boundedText(1, 150),
                                basis: boundedText(10, 300),
                            })
                            .strict(),
                    )
                    .max(3),
                balancedView: boundedText(20, 500),
            })
            .strict(),
        recommendedActions: z
            .array(
                z
                    .object({
                        label: boundedText(1, 150),
                        actionType: z.enum(["wait", "send_message", "confirm", "prepare", "other"]),
                        safety: z.enum(["safe", "caution"]),
                        reason: boundedText(10, 300),
                    })
                    .strict(),
            )
            .min(1)
            .max(4),
        avoidActions: z
            .array(
                z
                    .object({
                        label: boundedText(1, 150),
                        reason: boundedText(10, 300),
                    })
                    .strict(),
            )
            .min(1)
            .max(4),
        replyDrafts: z
            .array(
                z
                    .object({
                        tone: z.enum(["formal", "normal", "light"]),
                        text: boundedText(1, 400),
                    })
                    .strict(),
            )
            .max(3),
        contactTiming: boundedText(10, 300),
        usualVsCurrent: z
            .object({
                enabled: z.boolean(),
                usualPatternsUsed: z
                    .array(
                        z
                            .object({
                                label: boundedText(1, 150),
                                source: z.enum(["person_profile", "recent_case", "feedback"]),
                                relevance: strengthSchema,
                            })
                            .strict(),
                    )
                    .max(4),
                sameAsUsual: z
                    .array(
                        z
                            .object({
                                label: boundedText(1, 150),
                                reason: boundedText(10, 300),
                            })
                            .strict(),
                    )
                    .max(4),
                deviationSignals: z
                    .array(
                        z
                            .object({
                                label: boundedText(1, 150),
                                strength: strengthSchema,
                                reason: boundedText(10, 300),
                            })
                            .strict(),
                    )
                    .max(4),
                comparisonConclusion: boundedText(10, 500),
            })
            .strict(),
        disclaimer: z
            .object({
                notDiagnosis: z.literal(true),
                text: boundedText(20, 400),
            })
            .strict(),
    })
    .strict();

export type KigenAnalysisResultV2 = z.infer<typeof kigenAnalysisResultV2Schema>;
