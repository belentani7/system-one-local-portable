import type { ChoiceQuestion, DecideRequest, Question, ScoreQuestion } from "./schema";
import { isChoice, isNoul, isScore } from "./schema";

export type RawScores = Record<string, Record<string, number>>;

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 2),
  );
}

function overlap(state: Set<string>, description: string): number {
  const words = tokens(description);
  if (words.size === 0) return 0;
  let matches = 0;
  for (const word of words) if (state.has(word)) matches += 1;
  return matches / Math.sqrt(words.size);
}

function sentiment(state: string): number {
  const text = state.toLocaleLowerCase();
  const strong = ["furioso", "furious", "angry", "inaceptable", "amenaza", "cancelar", "urgente", "urgency", "exijo", "error 500", "caido", "bloqueado"];
  return strong.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
}

/**
 * Offline scorer. It is deliberately deterministic: same state and schema,
 * same scores. It never invents an answer outside the supplied schema.
 * This is a portable baseline, not a claim of consciousness or truth.
 */
export function scoreOffline(request: DecideRequest): RawScores {
  const stateText = typeof request.state === "string" ? request.state : JSON.stringify(request.state);
  const state = tokens(stateText);
  const mood = sentiment(stateText);
  const result: RawScores = {};

  for (const [key, question] of Object.entries(request.questions)) {
    if (isChoice(question)) {
      const q = question as ChoiceQuestion;
      result[key] = {};
      for (const [option, description] of Object.entries(q.criteria)) {
        result[key]![option] = overlap(state, `${option} ${description}`) * 8;
      }
    } else if (isScore(question)) {
      const q = question as ScoreQuestion;
      result[key] = {};
      q.criteria.forEach((label, index) => {
        const base = overlap(state, label) * 8;
        const intensity = q.criteria.length > 1 ? (index / (q.criteria.length - 1)) * mood : 0;
        result[key]![String(index)] = base + intensity;
      });
    } else if (isNoul(question)) {
      const yes = overlap(state, question.instructions) * 6 + mood * 0.8;
      result[key] = { yes };
    }
  }
  return result;
}

async function scoreRemote(
  request: DecideRequest,
  systemPrompt: string,
  userPrompt: string,
): Promise<RawScores> {
  const endpoint = process.env.DECISION_MODEL_URL;
  if (!endpoint) return scoreOffline(request);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.DECISION_MODEL_API_KEY
        ? { authorization: `Bearer ${process.env.DECISION_MODEL_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      model: process.env.DECISION_MODEL_NAME ?? request.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(Number(process.env.DECISION_MODEL_TIMEOUT_MS ?? 30000)),
  });
  if (!response.ok) throw new Error(`Decision model HTTP ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as RawScores;
}

export async function scoreRequest(
  request: DecideRequest,
  systemPrompt: string,
  userPrompt: string,
): Promise<RawScores> {
  const backend = process.env.DECISION_BACKEND ?? "offline";
  if (backend === "openai-compatible" || (backend === "auto" && process.env.DECISION_MODEL_URL)) {
    return scoreRemote(request, systemPrompt, userPrompt);
  }
  return scoreOffline(request);
}

export function providerName(): string {
  const backend = process.env.DECISION_BACKEND ?? "offline";
  return backend === "openai-compatible" || (backend === "auto" && process.env.DECISION_MODEL_URL)
    ? "openai-compatible"
    : "offline-deterministic";
}
