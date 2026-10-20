import { z } from "zod";

import type { ActionErrorCode } from "@/server/errors";
import { DESCRIPTION_MAX, TAGS_MAX } from "@/modules/time-entry/schema";

/** D-MCP-2: los alcances que pide el 401 y anuncian los metadatos. */
export const MCP_SCOPES = ["clock", "offline_access"] as const;

/** D-MCP-13: pedidos por persona y por minuto a `/api/mcp`. */
export const MCP_CALLS_PER_MINUTE = 120;

export const MCP_TOOL_NAMES = [
  "get_context",
  "list_projects",
  "list_entries",
  "create_entry",
  "update_entry",
  "delete_entry",
  "start_timer",
  "stop_timer",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** Textos que la interfaz y las herramientas muestran tal cual. */
export const mcpMessages = {
  unexpected: "No se pudo completar el pedido. Volvé a intentar.",
  noRunningTimer: "No hay ningún timer corriendo.",
  rateLimited: "Demasiados pedidos seguidos. Esperá un minuto y volvé a intentar.",
  grantForbidden: "No tenés permiso para hacer esto.",
  consentExpired: "El pedido de conexión venció. Volvé a conectar desde el asistente.",
  consentForbidden: "Tu acceso al workspace no permite conectar asistentes.",
  unexpectedRevoke: "No se pudo desconectar. Revisá la conexión y volvé a intentar.",
  unexpectedConsent:
    "No se pudo completar la conexión. Volvé a intentar desde el asistente.",
} as const;

// Las entradas de las herramientas fijan la forma que anuncia `tools/list`. Los
// textos y las reglas finas los aplica el esquema del módulo en `operations.ts`.

const dayKey = z.string().describe("Día en la zona de la persona, AAAA-MM-DD.");
const clock = z
  .string()
  .describe("Hora de pared en la zona de la persona, HH:mm de 24 h.");
const pair = {
  projectId: z
    .uuid()
    .nullable()
    .optional()
    .describe("Proyecto de list_projects; null es sin proyecto."),
  taskId: z.uuid().nullable().optional().describe("Tarea del proyecto; exige projectId."),
};
const tagIds = z
  .array(z.uuid())
  .max(TAGS_MAX)
  .optional()
  .describe("Etiquetas de list_projects; el conjunto entero.");
const newId = z
  .uuidv4()
  .optional()
  .describe("Id de la entrada nueva. Repetirlo no crea dos veces.");
const description = z
  .string()
  .max(DESCRIPTION_MAX)
  .optional()
  .describe("Descripción de la entrada.");
const billable = z
  .boolean()
  .optional()
  .describe("Facturable; sin el campo, el por defecto del proyecto.");

export const listEntriesToolInput = z.object({
  from: dayKey,
  to: dayKey.describe("Último día del período, incluido; hasta 31 días desde from."),
});
export const createEntryToolInput = z.object({
  id: newId,
  date: dayKey,
  start: clock,
  end: clock.describe("Hora de fin; menor que el inicio es el día siguiente."),
  description,
  ...pair,
  billable,
  tagIds,
});
export const updateEntryToolInput = z.object({
  id: z.uuid().describe("La entrada a editar."),
  description,
  project: z
    .object({ projectId: z.uuid().nullable(), taskId: z.uuid().nullable() })
    .optional()
    .describe("Proyecto y tarea juntos; null en los dos es sin proyecto."),
  times: z
    .object({ date: dayKey, start: clock, end: clock })
    .optional()
    .describe("Día, inicio y fin de una entrada cerrada, los tres juntos."),
  runningStart: z
    .object({ date: dayKey, start: clock })
    .optional()
    .describe("Nuevo inicio del timer que corre."),
  billable: z.boolean().optional().describe("Facturable."),
  tagIds,
});
export const deleteEntryToolInput = z.object({
  id: z.uuid().describe("La entrada a borrar."),
});
export const startTimerToolInput = z.object({
  id: newId,
  description,
  ...pair,
  billable,
  tagIds,
});
export const stopTimerToolInput = z.object({
  id: z.uuid().optional().describe("El timer a detener; sin id, el que corre."),
});

export type ListEntriesToolInput = z.output<typeof listEntriesToolInput>;
export type CreateEntryToolInput = z.output<typeof createEntryToolInput>;
export type UpdateEntryToolInput = z.output<typeof updateEntryToolInput>;
export type DeleteEntryToolInput = z.output<typeof deleteEntryToolInput>;
export type StartTimerToolInput = z.output<typeof startTimerToolInput>;
export type StopTimerToolInput = z.output<typeof stopTimerToolInput>;

// Las salidas: el `outputSchema` de cada herramienta y el tipo de su
// `structuredContent`.

const namedRef = z.object({ id: z.string(), name: z.string() });

/** Una entrada, como la ve el asistente (`toolEntryOf`). */
export const toolEntry = z.object({
  id: z.string(),
  description: z.string(),
  /** `dayDate` de la vista: el día local del inicio. */
  date: z.string(),
  /** `startClock` y `endClock`: HH:mm de 24 h en la zona de la persona. */
  start: z.string(),
  end: z.string().nullable(),
  /** Días que cruza el fin (TT-72). */
  extraDays: z.number().int(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  running: z.boolean(),
  project: namedRef.nullable(),
  task: namedRef.nullable(),
  billable: z.boolean(),
  tags: z.array(namedRef),
});
export type ToolEntry = z.infer<typeof toolEntry>;

export const getContextToolOutput = z.object({
  user: z.object({ name: z.string(), email: z.string() }),
  timezone: z.string(),
  today: z.string(),
  now: z.string(),
  weekStart: z.string(),
  running: toolEntry.nullable(),
});
export const listProjectsToolOutput = z.object({
  groups: z.array(
    z.object({
      client: namedRef.nullable(),
      projects: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          billableByDefault: z.boolean(),
          tasks: z.array(namedRef),
        }),
      ),
    }),
  ),
  tags: z.array(namedRef),
});
export const listEntriesToolOutput = z.object({
  timezone: z.string(),
  from: z.string(),
  to: z.string(),
  entries: z.array(toolEntry),
  running: toolEntry.nullable(),
  totalMinutes: z.number().int(),
  truncated: z.boolean(),
});
export const entryToolOutput = z.object({ entry: toolEntry });
export const deleteEntryToolOutput = z.object({ id: z.string() });
export const startTimerToolOutput = z.object({
  running: toolEntry,
  stopped: toolEntry.nullable(),
});
export const stopTimerToolOutput = z.object({ stopped: toolEntry });

export type GetContextToolOutput = z.infer<typeof getContextToolOutput>;
export type ListProjectsToolOutput = z.infer<typeof listProjectsToolOutput>;
export type ListEntriesToolOutput = z.infer<typeof listEntriesToolOutput>;
export type EntryToolOutput = z.infer<typeof entryToolOutput>;
export type DeleteEntryToolOutput = z.infer<typeof deleteEntryToolOutput>;
export type StartTimerToolOutput = z.infer<typeof startTimerToolOutput>;
export type StopTimerToolOutput = z.infer<typeof stopTimerToolOutput>;

// Las pantallas.

/** Lo que el service pone en una vista cuando el cliente no lo declara o vuelve a la computadora. */
export const mcpViewTexts = {
  unnamedClient: "Asistente sin nombre",
  loopback: "esta computadora",
} as const;

export type GrantView = {
  readonly clientId: string;
  /** El nombre que declaró el cliente, o «Asistente sin nombre». */
  readonly name: string;
  /** El host de la primera redirección, o «esta computadora» si es loopback. */
  readonly returnsTo: string;
  /** El día, con el formato de la persona. */
  readonly grantedOn: string;
};

export type GrantsView =
  | { readonly kind: "disabled" }
  | {
      readonly kind: "ready";
      readonly serverUrl: string;
      readonly grants: readonly GrantView[];
      readonly canRevoke: boolean;
    };

export const revokeGrantInput = z.object({ clientId: z.string().min(1).max(255) });
export type RevokeGrantInput = z.infer<typeof revokeGrantInput>;
export type RevokeGrantResult = { readonly clientId: string };

export type ConsentView =
  /** Sin consulta, con una firma que no verifica, vencida, o de un cliente que no existe. */
  | { readonly kind: "invalid" }
  /** Sin `mcp.connect`. */
  | { readonly kind: "forbidden"; readonly oauthQuery: string }
  | {
      readonly kind: "ready";
      /** La consulta firmada tal como llegó (`oauthQueryOf`), para mandarla como `oauth_query`. */
      readonly oauthQuery: string;
      readonly clientName: string;
      /** El host del `redirect_uri` **firmado**, o «esta computadora» si es loopback. */
      readonly returnsTo: string;
      readonly email: string;
    };

export const decideConsentInput = z.object({
  oauthQuery: z.string().min(1).max(8192),
  accept: z.boolean(),
});
export type DecideConsentInput = z.infer<typeof decideConsentInput>;
/** La dirección a la que el navegador sigue: el `url` del plugin, con el código o con `access_denied`. */
export type DecideConsentResult = { readonly redirectTo: string };

export type McpErrorCode = ActionErrorCode | "consent_expired";
