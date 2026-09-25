const payload = {
  state: "El cliente recibió un cobro duplicado y solicita un reembolso urgente.",
  model: "offline-local",
  questions: {
    team: {
      type: "choice",
      instructions: "¿Qué equipo debe resolverlo?",
      criteria: {
        billing: "Cobros, facturas, reembolsos y suscripciones",
        technical: "Errores, bugs y caídas",
        account: "Inicio de sesión y acceso",
      },
    },
    urgent: { type: "noul", instructions: "¿El estado expresa urgencia?" },
    frustration: {
      type: "score",
      instructions: "Nivel de frustración",
      criteria: ["Calmado", "Molesto", "Furioso"],
    },
  },
};

const response = await fetch("http://127.0.0.1:3100/v1/systemone", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
const result = await response.json();
for (const key of ["team", "urgent", "frustration"]) {
  if (!result.answers?.[key]) throw new Error(`Missing answer: ${key}`);
}
console.log(JSON.stringify({
  smoke: "OK",
  model: result.model,
  latency_ms: result.latency_ms,
  requires_escalation: result.requires_escalation,
  answers: result.answers,
}, null, 2));
