/**
 * Engine — motor de decisión tipada.
 *
 * Replica el "parallel sampler" de Jev: en vez de generar token a token, evalúa
 * todas las preguntas (Choice / Score / Noul) en una sola pasada sobre el mismo
 * estado (prefill compartido). El LLM NO genera prosa: devuelve un JSON estricto
 * con un score crudo por opción, que el sampler normaliza con softmax y calibra.
 *
 * El LLM actúa como "scorer" (assigna puntuaciones numéricas a cada opción)
 * y el engine hace la decisión final determinista. Así nunca hay alucinación de
 * texto: el output está acotado al esquema que el usuario definió.
 */

import {
  type Answer,
  type ChoiceQuestion,
  type DecideRequest,
  type DecideResponse,
  type NoulQuestion,
  type Question,
  type ScoreQuestion,
  isChoice,
  isNoul,
  isScore,
} from "./schema";
import {
  argmax,
  calibrate,
  estimateTokens,
  shouldEscalate,
  softmax,
  weightedScore,
} from "./confidence";
import { scoreRequest, type RawScores } from "./provider";

/* ---------- Construcción del prompt ---------- */

/**
 * Construye el system prompt que instruye al LLM a actuar como "scorer" System One.
 * El LLM recibe el state + las preguntas y devuelve un JSON de scores crudos por
 * opción. NUNCA genera texto libre fuera de ese JSON.
 */
function buildSystemPrompt(): string {
  return [
    "You are a System One decision model (Jev-style).",
    "",
    "Your ONLY job is to assign NUMERIC SCORES to every option of every question,",
    "given the state and the question schema. You do NOT generate explanations.",
    "You do NOT generate free text. You do NOT pick a single answer — you score",
    "EVERY option so the caller can normalize and calibrate.",
    "",
    "Output rules (STRICT, no exceptions):",
    "1. Output MUST be a single valid JSON object, nothing else.",
    "2. NO markdown fences, NO prose, NO comments, NO trailing text.",
    "3. Top-level keys are the question keys.",
    "4. For each question, output an object mapping each option key to a number.",
    "5. For 'choice' questions: option keys are the criteria keys.",
    "6. For 'score' questions: option keys are the integers '0','1','2',... as strings.",
    "   Score each integer position by how well it matches the state.",
    "7. For 'noul' questions: output an object with a single key 'yes' whose value",
    "   is a number representing how true the instruction is given the state.",
    "8. Higher number = stronger match. Numbers can be any real value (e.g. 0.7, 12, -3).",
    "9. If unsure, output smaller absolute values so softmax flattens the distribution.",
    "",
    "Example output shape:",
    "{",
    '  "department": { "billing": 0.8, "technical": 9.1, "account": 0.2 },',
    '  "is_urgent": { "yes": 8.4 },',
    '  "frustration": { "0": 0.1, "1": 2.0, "2": 7.3 }',
    "}",
  ].join("\n");
}

function buildUserPrompt(req: DecideRequest): string {
  const lines: string[] = [];
  lines.push("STATE:");
  lines.push("```");
  lines.push(req.state);
  lines.push("```");
  lines.push("");
  lines.push("QUESTIONS:");
  for (const [key, q] of Object.entries(req.questions)) {
    lines.push(`- ${key} (${q.type}): ${q.instructions}`);
    if (isChoice(q)) {
      const choice = q as ChoiceQuestion;
      lines.push("  options:");
      for (const [opt, desc] of Object.entries(choice.criteria)) {
        lines.push(`    - ${opt}: ${desc}`);
      }
    } else if (isScore(q)) {
      const score = q as ScoreQuestion;
      lines.push("  scale:");
      score.criteria.forEach((label, i) => {
        lines.push(`    - ${i}: ${label}`);
      });
    } else if (isNoul(q)) {
      // noul only needs instructions, already shown
    }
  }
  lines.push("");
  lines.push("Return ONLY the JSON object. No prose. No fences.");
  return lines.join("\n");
}

/* ---------- Parsing robusto ---------- */

function extractJson(text: string): unknown {
  // Quita fences de markdown si el LLM las añadió a pesar de las instrucciones
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  // Intenta encontrar el primer { y el último }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error(`Model did not return a JSON object: ${text.slice(0, 200)}`);
  }
  const slice = cleaned.slice(first, last + 1);
  return JSON.parse(slice);
}

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/* ---------- Decisión por primitiva ---------- */

function decideChoice(
  q: ChoiceQuestion,
  scores: Record<string, number>,
): Answer {
  const probabilities = softmax(scores, 1.0);
  const choice = argmax(probabilities);
  const confidence = calibrate(probabilities);
  return {
    type: "choice",
    choice,
    probabilities,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

function decideScore(
  q: ScoreQuestion,
  scores: Record<string, number>,
): Answer {
  // Asegura que todas las posiciones 0..n-1 estén presentes (las que falten = 0)
  const full: Record<string, number> = {};
  q.criteria.forEach((_, i) => {
    full[String(i)] = scores[String(i)] ?? 0;
  });
  const probabilities = softmax(full, 1.0);
  const score = weightedScore(probabilities);
  const confidence = calibrate(probabilities);
  const legend: Record<string, string> = {};
  q.criteria.forEach((label, i) => {
    legend[String(i)] = label;
  });
  return {
    type: "score",
    score,
    legend,
    probabilities,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

function decideNoul(scoreYes: number): Answer {
  // El LLM nos da un score crudo para "yes". Lo pasamos por un sigmoid para
  // llevarlo a [0,1] — esto es la "probabilidad de sí" calibrada.
  // sigmoid(s) = 1 / (1 + e^{-s})
  const noul = 1 / (1 + Math.exp(-scoreYes));
  return {
    type: "noul",
    noul: Math.round(noul * 1000) / 1000,
  };
}

/* ---------- API pública ---------- */

export async function decide(req: DecideRequest): Promise<DecideResponse> {
  const startedAt = performance.now();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(req);
  const inputTokens = estimateTokens(systemPrompt + userPrompt);

  let parsed: RawScores;
  try {
    parsed = await scoreRequest(req, systemPrompt, userPrompt);
  } catch (err) {
    // Fallback determinista: todo cero => distribución uniforme => confidence 0
    parsed = {};
  }

  const answers: Record<string, Answer> = {};
  const escalated: string[] = [];
  const threshold = req.confidence_threshold ?? 0.6;

  for (const [key, q] of Object.entries(req.questions)) {
    const scores = (parsed[key] ?? {}) as Record<string, number>;
    let answer: Answer;
    if (isChoice(q)) {
      // Asegura que todas las opciones estén
      const full: Record<string, number> = {};
      for (const opt of Object.keys((q as ChoiceQuestion).criteria)) {
        full[opt] = asNumber(scores[opt]);
      }
      answer = decideChoice(q as ChoiceQuestion, full);
    } else if (isScore(q)) {
      const full: Record<string, number> = {};
      (q as ScoreQuestion).criteria.forEach((_, i) => {
        full[String(i)] = asNumber(scores[String(i)]);
      });
      answer = decideScore(q as ScoreQuestion, full);
    } else {
      // noul
      const yesScore = asNumber((scores as Record<string, unknown>).yes);
      answer = decideNoul(yesScore);
    }
    answers[key] = answer;

    if (shouldEscalate(q.type, answer, threshold)) {
      escalated.push(key);
    }
  }

  const latencyMs = Math.round(performance.now() - startedAt);

  return {
    model: req.model,
    answers,
    usage: { input_tokens: inputTokens, output_tokens: 0 },
    latency_ms: latencyMs,
    requires_escalation: escalated.length > 0,
    escalated_questions: escalated,
  };
}
