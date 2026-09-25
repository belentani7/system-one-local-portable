"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  Bug,
  ChevronDown,
  Cpu,
  Github,
  Loader2,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { PRESETS, type Preset } from "@/lib/systemone";
import type { DecideRequest, DecideResponse } from "@/lib/systemone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { QuestionEditor, type QuestionsMap } from "@/components/systemone/question-editor";
import { DecisionCard } from "@/components/systemone/decision-card";
import { ResultMetrics } from "@/components/systemone/result-metrics";
import { PresetCard } from "@/components/systemone/preset-card";
import { JsonViewer } from "@/components/systemone/json-viewer";
import { EscalationBadge } from "@/components/systemone/escalation-badge";

interface HistoryItem {
  id: string;
  state_preview: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  requires_escalation: boolean;
  escalated: string[];
  created_at: string;
  questions: unknown;
  answers: unknown;
}

export default function PlaygroundPage() {
  // ---------- estado del formulario ----------
  const [state, setState] = useState<string>(PRESETS[0]!.request.state);
  const [questions, setQuestions] = useState<QuestionsMap>(
    PRESETS[0]!.request.questions as QuestionsMap,
  );
  const [activePresetId, setActivePresetId] = useState<string>(PRESETS[0]!.id);
  const [threshold, setThreshold] = useState<number>(0.6);
  const [temperature, setTemperature] = useState<number>(0.7);

  // ---------- estado de la llamada ----------
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<DecideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------- historial ----------
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---------- presets ----------
  const loadPreset = useCallback((p: Preset) => {
    setState(p.request.state);
    setQuestions(p.request.questions as QuestionsMap);
    setThreshold(p.request.confidence_threshold ?? 0.6);
    setActivePresetId(p.id);
    setResponse(null);
    setError(null);
  }, []);

  // ---------- llamada al endpoint /api/decide ----------
  const runDecide = useCallback(async () => {
    if (Object.keys(questions).length === 0) {
      toast({
        title: "No questions defined",
        description: "Add at least one question before running the engine.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    const body: DecideRequest = {
      state,
      model: "local-latest",
      questions,
      confidence_threshold: threshold,
      temperature,
    };
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
      const data: DecideResponse = await res.json();
      setResponse(data);
      toast({
        title: "Decision ready",
        description: `${data.latency_ms} ms · ${
          data.requires_escalation ? "escalated" : "ok"
        }`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast({
        title: "Decision failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      void t0;
    }
  }, [state, questions, threshold, temperature]);

  // ---------- cargar historial ----------
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history?limit=8", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(data.items as HistoryItem[]);
    } catch {
      // silencioso
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await fetch("/api/history", { method: "DELETE" });
      setHistory([]);
      toast({ title: "History cleared" });
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // respuesta a mostrar (la actual o la del historial seleccionado)
  const [historySelected, setHistorySelected] = useState<HistoryItem | null>(
    null,
  );

  const shownResponse: DecideResponse | null = useMemo(() => {
    if (historySelected) {
      return {
        model: historySelected.model,
        answers: historySelected.answers as DecideResponse["answers"],
        usage: {
          input_tokens: historySelected.input_tokens,
          output_tokens: historySelected.output_tokens,
        },
        latency_ms: historySelected.latency_ms,
        requires_escalation: historySelected.requires_escalation,
        escalated_questions: historySelected.escalated,
      };
    }
    return response;
  }, [response, historySelected]);

  // ---------- métricas agregadas ----------
  const avgLatency = history.length
    ? Math.round(
        history.reduce((a, h) => a + h.latency_ms, 0) / history.length,
      )
    : 0;
  const escalationRate = history.length
    ? Math.round(
        (history.filter((h) => h.requires_escalation).length / history.length) *
          100,
      )
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* ---------- Hero strip ---------- */}
        <section className="mb-6">
          <div className="rounded-xl border border-border bg-gradient-to-br from-card/80 to-background p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    System One
                  </Badge>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] gap-1"
                  >
                    <Brain className="w-3 h-3 text-violet-500" />
                    Jev-compatible
                  </Badge>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] gap-1"
                  >
                    <Cpu className="w-3 h-3 text-amber-500" />
                    local-latest
                  </Badge>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  System One Local
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    — typed decisions, not prose
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                  Réplica local del contrato{" "}
                  <code className="text-foreground/80">/v1/systemone</code> de
                  TypeSafe AI. Recibe un{" "}
                  <span className="font-mono">state</span> + un esquema de
                  preguntas tipadas (<span className="font-mono">choice</span>,{" "}
                  <span className="font-mono">noul</span>,{" "}
                  <span className="font-mono">score</span>) y devuelve
                  decisiones con{" "}
                  <span className="font-mono">value + confidence</span>. Cero
                  generación de texto libre → cero alucinación.
                </p>
              </div>
              {/* mini stats */}
              <div className="grid grid-cols-3 gap-3 min-w-[260px]">
                <MiniStat
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="Avg latency"
                  value={avgLatency ? `${avgLatency}ms` : "—"}
                />
                <MiniStat
                  icon={<Activity className="w-3.5 h-3.5" />}
                  label="Escalation rate"
                  value={history.length ? `${escalationRate}%` : "—"}
                />
                <MiniStat
                  icon={<Brain className="w-3.5 h-3.5" />}
                  label="Decisions"
                  value={String(history.length)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Grid principal ---------- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ---------- columna izquierda: editor ---------- */}
          <section className="lg:col-span-7 space-y-5">
            {/* State */}
            <EditorCard
              title="State"
              subtitle="Dato de entrada (texto / JSON) sobre el que se decide"
            >
              <Textarea
                value={state}
                onChange={(e) => setState(e.target.value)}
                rows={5}
                placeholder="Pega aquí el texto o JSON del estado…"
                className="font-mono text-xs resize-y"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{state.length} chars</span>
                <span>≈ {Math.ceil(state.length / 4)} tokens</span>
              </div>
            </EditorCard>

            {/* Questions */}
            <EditorCard
              title="Questions"
              subtitle="Esquema tipado — el LLM scorea cada opción, no genera texto"
            >
              <QuestionEditor questions={questions} onChange={setQuestions} />
            </EditorCard>

            {/* Settings */}
            <EditorCard
              title="Engine settings"
              subtitle="Umbral de escalación + temperatura del sampler"
              defaultOpen={false}
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Confidence threshold ·{" "}
                      <span className="font-mono text-foreground">
                        {Math.round(threshold * 100)}%
                      </span>
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      Por debajo → escalate
                    </span>
                  </div>
                  <Slider
                    value={[threshold]}
                    onValueChange={(v) => setThreshold(v[0]!)}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Softmax temperature ·{" "}
                      <span className="font-mono text-foreground">
                        {temperature.toFixed(2)}
                      </span>
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      &gt;1 más plano · &lt;1 más afilado
                    </span>
                  </div>
                  <Slider
                    value={[temperature]}
                    onValueChange={(v) => setTemperature(v[0]!)}
                    min={0.1}
                    max={2}
                    step={0.05}
                  />
                </div>
              </div>
            </EditorCard>

            {/* Run */}
            <div className="flex items-center gap-2">
              <Button
                onClick={runDecide}
                disabled={loading}
                className="gap-2 flex-1 sm:flex-none"
                size="lg"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {loading ? "Deciding…" : "Run decision"}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => loadPreset(PRESETS.find((p) => p.id === activePresetId)!)}
                disabled={loading}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
                <Bug className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Engine error</div>
                  <code className="font-mono text-[11px] break-all">{error}</code>
                </div>
              </div>
            )}
          </section>

          {/* ---------- columna derecha: resultado + presets ---------- */}
          <section className="lg:col-span-5 space-y-5">
            {/* Presets */}
            <EditorCard
              title="Example presets"
              subtitle="Casos canónicos de Jev listos para ejecutar"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <PresetCard
                    key={p.id}
                    preset={p}
                    active={p.id === activePresetId}
                    onSelect={() => loadPreset(p)}
                  />
                ))}
              </div>
            </EditorCard>

            {/* Result */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Decision
                </h2>
                {shownResponse && (
                  <EscalationBadge
                    requiresEscalation={shownResponse.requires_escalation}
                    count={shownResponse.escalated_questions.length}
                  />
                )}
              </div>

              {!shownResponse && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {loading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sampling all options in parallel…
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Brain className="w-6 h-6 text-muted-foreground/50" />
                      Run a decision to see typed answers here.
                    </div>
                  )}
                </div>
              )}

              {shownResponse && (
                <div className="space-y-3">
                  <ResultMetrics
                    response={shownResponse}
                    threshold={threshold}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(shownResponse.answers).map(([key, ans]) => {
                      const q = (questions[key] ??
                        (historySelected?.questions as Record<string, never>)?.[
                          key
                        ] ??
                        {}) as never;
                      return (
                        <DecisionCard
                          key={key}
                          questionKey={key}
                          question={q}
                          answer={ans}
                          threshold={threshold}
                          escalated={shownResponse.escalated_questions.includes(
                            key,
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Contrato crudo */}
            <Tabs defaultValue="response">
              <TabsList className="w-full">
                <TabsTrigger value="response" className="flex-1 gap-1.5 text-xs">
                  <Zap className="w-3 h-3" />
                  Response
                </TabsTrigger>
                <TabsTrigger value="request" className="flex-1 gap-1.5 text-xs">
                  <Cpu className="w-3 h-3" />
                  Request
                </TabsTrigger>
              </TabsList>
              <TabsContent value="response" className="mt-2">
                <JsonViewer
                  data={
                    shownResponse ?? { _hint: "Run a decision to see the contract" }
                  }
                  label="POST /v1/systemone — response"
                  defaultOpen={false}
                />
              </TabsContent>
              <TabsContent value="request" className="mt-2">
                <JsonViewer
                  data={{
                    state,
                    model: "local-latest",
                    questions,
                    confidence_threshold: threshold,
                    temperature,
                  }}
                  label="POST /v1/systemone — request"
                  defaultOpen={false}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        {/* ---------- Historial ---------- */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Recent decisions
              <Badge variant="secondary" className="text-[10px]">
                {history.length}
              </Badge>
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadHistory()}
                className="h-7 text-xs gap-1.5"
                disabled={historyLoading}
              >
                <RotateCcw className="w-3 h-3" />
                Refresh
              </Button>
              {history.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="h-7 text-xs gap-1.5 text-rose-500 hover:text-rose-600"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              No decisions yet. Run one to populate the history.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    setHistorySelected(
                      historySelected?.id === h.id ? null : h,
                    );
                  }}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-all hover:bg-accent/40",
                    historySelected?.id === h.id
                      ? "border-foreground/30 ring-1 ring-foreground/10 bg-accent/30"
                      : "border-border bg-card/40",
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <EscalationBadge
                      requiresEscalation={h.requires_escalation}
                      count={h.escalated.length}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {h.latency_ms}ms
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 line-clamp-3 mb-2">
                    {h.state_preview}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                    <span>{h.input_tokens} tok</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

/* ---------- Sub-componentes ---------- */

function Header() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-foreground text-background grid place-items-center font-mono font-bold text-xs">
            S1
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-sm">System One</span>
            <span className="text-xs text-muted-foreground">/local</span>
          </div>
        </div>
        <nav className="hidden sm:flex items-center gap-1">
          <a
            href="#playground"
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            Playground
          </a>
          <a
            href="#presets"
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            Presets
          </a>
          <a
            href="https://docs.typesafe.ai"
            target="_blank"
            rel="noreferrer noopener"
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            Docs
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            online
          </Badge>
          <ThemeToggle />
          <a
            href="https://github.com/AbdelStark/awesome-typesafe-jev"
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-foreground/10 grid place-items-center font-mono font-bold text-[9px]">
              S1
            </div>
            <span>
              System One Local · réplica del contrato{" "}
              <code className="font-mono">/v1/systemone</code> de TypeSafe AI.
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono">output_tokens = 0</span>
            <span className="text-border">·</span>
            <span>no alucinación · no prosa</span>
            <span className="text-border">·</span>
            <span>parallel sampling</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EditorCard({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
      >
        <div className="text-left">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <Settings2 className="hidden" aria-hidden />
          {children}
        </div>
      )}
    </div>
  );
}
