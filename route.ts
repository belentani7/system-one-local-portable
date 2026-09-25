import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DecideRequestSchema, type DecideRequest } from "@/lib/systemone";
import { decide } from "@/lib/systemone/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/decide
 *
 * Endpoint compatible con el contrato TypeSafe `/v1/systemone`.
 * Recibe { state, model, questions, confidence_threshold, temperature }
 * y devuelve decisiones tipadas con confidence, latencia y flags de escalación.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = DecideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const request: DecideRequest = parsed.data;

  try {
    const response = await decide(request);

    // Persistir en el log (no bloquea la respuesta; si falla, no importa)
    try {
      await db.decisionLog.create({
        data: {
          state: request.state,
          questionsJson: JSON.stringify(request.questions),
          answersJson: JSON.stringify(response.answers),
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          latencyMs: response.latency_ms,
          requiresEscalation: response.requires_escalation,
          escalatedJson: JSON.stringify(response.escalated_questions),
          threshold: request.confidence_threshold ?? 0.6,
        },
      });
    } catch (e) {
      // No propagamos errores de logging
      console.error("[decide] failed to persist log:", e);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("[decide] engine error:", err);
    return NextResponse.json(
      {
        error: "Decision engine failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/decide — pequeño health check.
 */
export async function GET() {
  return NextResponse.json({
    service: "system-one-local",
    contract: "/v1/systemone-compatible",
    primitives: ["choice", "score", "noul"],
    model: "local-latest",
    status: "ok",
  });
}
