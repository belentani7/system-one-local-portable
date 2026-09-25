import { z } from "zod";

/**
 * System One Local — esquemas de decisión tipada (réplica del contrato Jev / TypeSafe).
 *
 * Tres primitivas:
 *   - choice: opción múltiple (devuelve opción elegida + probabilidad por opción + confidence)
 *   - noul:   afirmación verdadera/falsa (devuelve probabilidad 0..1)
 *   - score:  escala ordinal (devuelve posición ponderada + distribución + confidence)
 *
 * No hay generación de texto libre: el "output_tokens" del contrato es siempre 0.
 */

export const PRIMITIVE_TYPES = ["choice", "score", "noul"] as const;
export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/* ---------- Question: Choice ---------- */
export const ChoiceCriteriaSchema = z
  .record(z.string(), z.string())
  .refine((rec) => Object.keys(rec).length >= 1, {
    message: "At least one option required",
  });
export type ChoiceCriteria = z.infer<typeof ChoiceCriteriaSchema>;

export const ChoiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1),
  criteria: ChoiceCriteriaSchema,
});
export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;

export const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1),
});
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;

/* ---------- Question: Noul ---------- */
export const NoulQuestionSchema = z.object({
  type: z.literal("noul"),
  instructions: z.string().min(1),
});
export type NoulQuestion = z.infer<typeof NoulQuestionSchema>;

export const NoulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});
export type NoulAnswer = z.infer<typeof NoulAnswerSchema>;

/* ---------- Question: Score ---------- */
export const ScoreQuestionSchema = z.object({
  type: z.literal("score"),
  instructions: z.string().min(1),
  criteria: z.array(z.string()).min(2),
});
export type ScoreQuestion = z.infer<typeof ScoreQuestionSchema>;

export const ScoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string(), z.string()),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1),
});
export type ScoreAnswer = z.infer<typeof ScoreAnswerSchema>;

/* ---------- Uniones ---------- */
export const QuestionSchema = z.union([
  ChoiceQuestionSchema,
  ScoreQuestionSchema,
  NoulQuestionSchema,
]);
export type Question = z.infer<typeof QuestionSchema>;

export const AnswerSchema = z.union([
  ChoiceAnswerSchema,
  ScoreAnswerSchema,
  NoulAnswerSchema,
]);
export type Answer = z.infer<typeof AnswerSchema>;

/* ---------- Request / Response ---------- */
export const DecideRequestSchema = z.object({
  state: z.string().min(1),
  model: z.string().optional().default("local-latest"),
  questions: z
    .record(z.string(), QuestionSchema)
    .refine((q) => Object.keys(q).length >= 1, {
      message: "At least one question required",
    }),
  // Configuración opcional de escalación
  confidence_threshold: z.number().min(0).max(1).optional().default(0.6),
  temperature: z.number().min(0).max(2).optional().default(0.7),
});
export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export const DecideResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), AnswerSchema),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number().default(0),
  }),
  latency_ms: z.number(),
  requires_escalation: z.boolean(),
  escalated_questions: z.array(z.string()).default([]),
});
export type DecideResponse = z.infer<typeof DecideResponseSchema>;

/* ---------- Helper: discriminar primitiva ---------- */
export function isChoice(q: Question): q is ChoiceQuestion {
  return q.type === "choice";
}
export function isScore(q: Question): q is ScoreQuestion {
  return q.type === "score";
}
export function isNoul(q: Question): q is NoulQuestion {
  return q.type === "noul";
}

/* ---------- Etiquetas legibles ---------- */
export const PRIMITIVE_META: Record<
  PrimitiveType,
  { label: string; short: string; color: string; description: string }
> = {
  choice: {
    label: "Choice",
    short: "CH",
    color: "emerald",
    description:
      "¿Cuál de estas opciones? Devuelve la elegida + probabilidad por opción + confidence.",
  },
  noul: {
    label: "Noul",
    short: "NL",
    color: "violet",
    description:
      "¿Es verdad esta afirmación? Devuelve la probabilidad de sí (0–1).",
  },
  score: {
    label: "Score",
    short: "SC",
    color: "amber",
    description:
      "¿Dónde cae en una escala ordenada? Devuelve posición ponderada + distribución + confidence.",
  },
};
