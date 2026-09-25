# System One Local — paquete portable

Este proyecto puede descargarse y ejecutarse fuera de Manus. El runtime no importa SDKs privados ni necesita conectarse a este servidor.

## Qué contiene realmente

El sistema recibe un `state` y preguntas cerradas (`choice`, `score`, `noul`). Devuelve únicamente respuestas dentro del esquema recibido, probabilidades, confianza, latencia y escalación. La interfaz web es opcional: la API es el producto reutilizable.

El modo predeterminado es `offline-deterministic`. Es una función reproducible de puntuación por coincidencia de términos e intensidad. No es consciente, no “tiene grabada la realidad” y no debe presentarse como una mente. Su ventaja es que funciona sin red, sin créditos, sin claves y con comportamiento auditable.

Para decisiones semánticas más capaces se puede conectar cualquier modelo local o remoto que exponga una API compatible con OpenAI. El modelo externo es opcional y sustituible; el contrato de la aplicación no cambia.

## Ejecución directa

Requisitos: Node.js 22 o superior.

```bash
cp .env.example .env
npm ci
npx prisma generate
npm run build
npm run start:portable
```

La aplicación queda en `http://localhost:3000`. El endpoint para integraciones es:

```text
POST http://localhost:3000/v1/systemone
```

Ejemplo:

```bash
curl -s http://localhost:3000/v1/systemone \
  -H 'content-type: application/json' \
  -d '{
    "state": "El cliente recibió un cobro duplicado y solicita un reembolso urgente.",
    "model": "offline-local",
    "questions": {
      "team": {
        "type": "choice",
        "instructions": "¿Qué equipo debe resolverlo?",
        "criteria": {
          "billing": "Cobros, facturas, reembolsos y suscripciones",
          "technical": "Errores, bugs y caídas",
          "account": "Inicio de sesión y acceso"
        }
      },
      "urgent": {
        "type": "noul",
        "instructions": "¿El estado expresa urgencia?"
      },
      "frustration": {
        "type": "score",
        "instructions": "Nivel de frustración",
        "criteria": ["Calmado", "Molesto", "Furioso"]
      }
    }
  }'
```

## Ejecución con Docker

```bash
docker build -t system-one-local .
docker run --rm -p 3000:3000 --env-file .env system-one-local
```

Esto crea una imagen autocontenida que puede trasladarse a otro proveedor, una VM, un NAS o un equipo local.

## Conectar un modelo compatible

En `.env`:

```dotenv
DECISION_BACKEND=openai-compatible
DECISION_MODEL_URL=http://host.docker.internal:11434/v1/chat/completions
DECISION_MODEL_NAME=tu-modelo-local
DECISION_MODEL_API_KEY=
```

El proveedor envía un único `state + schema` y exige un objeto JSON de scores. El motor sigue normalizando, calibrando y escalando las respuestas; nunca devuelve prosa libre. Si no se configura el backend externo, el sistema usa el modo offline.

## Contrato de portabilidad

- **Sin dependencia de Manus:** no se usa `z-ai-web-dev-sdk` ni una URL privada.
- **Sin dependencia obligatoria de proveedor:** el modo offline requiere solo Node.js.
- **Integrable como servicio:** `POST /v1/systemone`.
- **Integrable como agente:** cualquier agente puede invocar el endpoint y ejecutar la acción posterior en su propio runtime.
- **Salida acotada:** el cliente define las opciones; el motor no puede inventar una etiqueta fuera del esquema.
- **Escalación:** `requires_escalation` y `escalated_questions` permiten que un agente delegue decisiones ambiguas a una persona o a un modelo de razonamiento.

## Límites honestos

La confianza matemática no equivale automáticamente a exactitud real. Para hacerla estadísticamente fiable hay que calibrarla con un conjunto de casos etiquetados del dominio. El modo offline es una base portable y determinista, no un reemplazo de un modelo entrenado con RLCD. Las afirmaciones de consciencia, verdad absoluta o “realidad grabada” no son propiedades técnicas demostrables de este software.
