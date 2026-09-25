/**
 * Confidence — calibración y umbrales.
 *
 * En Jev real, RLCD (Reinforcement Learning for Calibrated Decisions) garantiza que un
 * confidence de 0.8 acierte ~80% de las veces. En local, sin un modelo entrenado con
 * RLCD, hacemos una aproximación honesta:
 *
 *   1. El LLM nos devuelve logprobabilities (o probabilidad bruta) por cada opción.
 *   2. Normalizamos con softmax sobre los logits / scores crudos para que sumen 1.
 *   3. El "confidence" se define como la probabilidad de la opción ganadora, calibrado
 *      por una temperatura ajustable y un factor de "honestidad" que penaliza decisiones
 *      tomadas con poca distancia entre el top-1 y top-2 (margen).
 *   4. Si el confidence cae por debajo del umbral configurado, marcamos escalación.
 */

export interface ProbabilityMass {
  probabilities: Record<string, number>;
  /** probabilidad de la opción ganadora, ya calibrada */
  confidence: number;
}

/**
 * Normaliza un vector de scores (crudos, posiblemente no acotados) a una distribución
 * de probabilidad vía softmax con temperatura.
 *
 *   p_i = exp(s_i / T) / Σ exp(s_j / T)
 *
 * T > 1 suaviza (más incertidumbre), T < 1 afila (más confianza). T = 1 = identidad.
 */
export function softmax(
  scores: Record<string, number>,
  temperature = 1,
): Record<string, number> {
  const T = Math.max(0.01, temperature);
  const entries = Object.entries(scores);
  if (entries.length === 0) return {};

  // Estabilización numérica: restar el máximo
  const max = Math.max(...entries.map(([, v]) => v));
  const exps = entries.map(([k, v]) => [k, Math.exp((v - max) / T)] as const);
  const sum = exps.reduce((acc, [, v]) => acc + v, 0);
  if (sum === 0) {
    // Todos -Infinity o cero: distribución uniforme
    const uniform = 1 / entries.length;
    return Object.fromEntries(entries.map(([k]) => [k, uniform]));
  }
  return Object.fromEntries(exps.map(([k, v]) => [k, v / sum]));
}

/**
 * Calibra el confidence a partir de la distribución de probabilidad y el margen
 * entre la opción ganadora y la segunda.
 *
 *   confidence = p_top * (1 - 0.35 * (p_second / p_top))
 *
 * Esto penaliza decisiones ambiguas (top-1 y top-2 muy próximas) aunque la
 * probabilidad bruta de la ganadora sea alta. El factor 0.35 es conservador.
 */
export function calibrate(
  probabilities: Record<string, number>,
): number {
  const values = Object.values(probabilities).sort((a, b) => b - a);
  if (values.length === 0) return 0;
  const top = values[0];
  const second = values[1] ?? 0;
  if (top === 0) return 0;
  const margin = second / top; // 0..1, 0 = segura, 1 = ambigua
  return Math.max(0, Math.min(1, top * (1 - 0.35 * margin)));
}

/**
 * Devuelve la clave del valor máximo de un record de números.
 */
export function argmax(probabilities: Record<string, number>): string {
  let best = "";
  let bestVal = -Infinity;
  for (const [k, v] of Object.entries(probabilities)) {
    if (v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

/**
 * Calcula un score ponderado (para primitiva Score) a partir de la distribución
 * de probabilidad sobre índices enteros {0, 1, 2, ...}.
 *
 *   score = Σ i * p_i
 *
 * Esto da la "posición ponderada" en la escala. Si p = {0:0.05, 1:0.30, 2:0.65}
 * el score será 1.6 (entre 1 y 2, tirando hacia 2).
 */
export function weightedScore(probabilities: Record<string, number>): number {
  let acc = 0;
  for (const [k, v] of Object.entries(probabilities)) {
    const idx = Number(k);
    if (!Number.isNaN(idx)) acc += idx * v;
  }
  // Redondeo a 2 decimales para estabilidad en el JSON
  return Math.round(acc * 100) / 100;
}

/**
 * Determina qué preguntas requieren escalación a humano / LLM razonador.
 *
 * - noul no lleva confidence separado (el valor ya es la certeza), pero
 *   escalamos si la certeza está en la "zona gris" (0.3 < n < 0.7) donde
 *   el modelo no se atreve ni a un sí ni a un no.
 * - choice / score escalan si confidence < threshold.
 */
export function shouldEscalate(
  questionType: "choice" | "score" | "noul",
  answer:
    | { confidence: number }
    | { noul: number },
  threshold: number,
): boolean {
  if (questionType === "noul") {
    const n = (answer as { noul: number }).noul;
    // Zona gris: ni claro sí ni claro no
    return n > 0.3 && n < 0.7;
  }
  const c = (answer as { confidence: number }).confidence;
  return c < threshold;
}

/**
 * Estimación barata de tokens de entrada (≈ 4 caracteres por token).
 * El contrato TypeSafe reporta input_tokens reales; en local lo aproximamos.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
