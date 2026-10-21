import { z } from "zod";

import type { ActionErrorCode } from "@/server/errors";
import { REPORT_GROUP_BYS, REPORT_MAX_FILTER_VALUES } from "@/modules/report/schema";
import { DESCRIPTION_MAX, TAGS_MAX } from "@/modules/time-entry/schema";

/** D-MCP-2: los alcances que pide el 401 y anuncian los metadatos. */
export const MCP_SCOPES = ["clock", "offline_access"] as const;

/** D-MCP-13: pedidos por persona y por minuto a `/api/mcp`. */
export const MCP_CALLS_PER_MINUTE = 120;

/** Textos que la interfaz y las herramientas muestran tal cual. */
export const mcpMessages = {
  unexpected: "No se pudo completar el pedido. Volvé a intentar.",
  rateLimited: "Demasiados pedidos seguidos. Esperá un minuto y volvé a intentar.",
  batchUnsupported: "El servidor no acepta lotes JSON-RPC: mandá un mensaje por pedido.",
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

const groupBy = z.enum(REPORT_GROUP_BYS);

export const summarizeHoursToolInput = z.object({
  from: dayKey,
  to: dayKey.describe("Último día del período, incluido; hasta 366 días desde from."),
  groupBy: groupBy
    .optional()
    .describe("El primer nivel de agrupación; sin el campo, person."),
  subgroups: z
    .array(groupBy)
    .max(2)
    .optional()
    .describe("Hasta dos niveles debajo de groupBy, distintos entre sí y de groupBy."),
  userIds: z
    .array(z.string())
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .optional()
    .describe("Ids de list_people; sin el campo, todas las personas que se pueden ver."),
  projectIds: z
    .array(z.uuid())
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .optional()
    .describe("Ids de proyecto de list_projects o de un grupo por proyecto."),
  withoutProject: z
    .boolean()
    .optional()
    .describe(
      "Suma las entradas sin proyecto al filtro de proyectos, o las elige solas.",
    ),
  clientIds: z
    .array(z.uuid())
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .optional()
    .describe("Ids de cliente de list_projects o de un grupo por cliente."),
  includePeopleWithoutTime: z
    .boolean()
    .optional()
    .describe(
      "Con groupBy person y si se ve a todas: suma en 0 a las personas activas sin horas en el período.",
    ),
});

export type UpdateEntryToolInput = z.output<typeof updateEntryToolInput>;

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

/** D-MCPE-2: `everyone` si se ve a todas las personas; `self`, solo lo propio. */
const summaryScope = z.enum(["everyone", "self"]);

/** D-MCPE-5: lo común a un grupo de cualquier nivel. */
const summaryGroupFields = {
  kind: groupBy,
  /**
   * El id de la persona, el proyecto, el cliente, la tarea, la etiqueta o el
   * hash de la descripción; el primer día del tramo (AAAA-MM-DD) en date, week
   * y month; `null` en los «Sin …».
   */
  key: z.string().nullable(),
  /** El nombre, la descripción (hasta 100 caracteres) o el mismo día de key; `null` en los «Sin …». */
  name: z.string().nullable(),
  minutes: z.number().int(),
  /** Solo en person (RP-61). */
  inactive: z.boolean().optional(),
  /** Solo en project: el nombre del cliente, o `null`. */
  client: z.string().nullable().optional(),
  /** Solo en task: el nombre del proyecto, o `null`. */
  project: z.string().nullable().optional(),
  /** Solo en description: el texto entero es más largo que name. */
  truncated: z.boolean().optional(),
};

// D-MCPE-5: tres formas fijas, sin un esquema recursivo (V-1).
const summaryLeaf = z.object(summaryGroupFields);
const summaryMiddle = summaryLeaf.extend({ children: z.array(summaryLeaf).optional() });
const summaryGroup = summaryLeaf.extend({ children: z.array(summaryMiddle).optional() });

export const summarizeHoursToolOutput = z.object({
  timezone: z.string(),
  from: z.string(),
  to: z.string(),
  scope: summaryScope,
  groupBy,
  subgroups: z.array(groupBy),
  /** Los niveles que entraron en el tope: menos que los pedidos si no (D-R3-6). */
  levelsShown: z.number().int(),
  totalMinutes: z.number().int(),
  billableMinutes: z.number().int(),
  groups: z.array(summaryGroup),
});

export const listPeopleToolOutput = z.object({
  scope: summaryScope,
  people: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      inactive: z.boolean(),
      self: z.boolean(),
    }),
  ),
});

export type GetContextToolOutput = z.infer<typeof getContextToolOutput>;
export type ListProjectsToolOutput = z.infer<typeof listProjectsToolOutput>;
export type ListEntriesToolOutput = z.infer<typeof listEntriesToolOutput>;
export type EntryToolOutput = z.infer<typeof entryToolOutput>;
export type DeleteEntryToolOutput = z.infer<typeof deleteEntryToolOutput>;
export type StartTimerToolOutput = z.infer<typeof startTimerToolOutput>;
export type StopTimerToolOutput = z.infer<typeof stopTimerToolOutput>;
export type SummarizeHoursToolOutput = z.infer<typeof summarizeHoursToolOutput>;
export type ListPeopleToolOutput = z.infer<typeof listPeopleToolOutput>;
export type SummaryGroup = z.infer<typeof summaryGroup>;

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

/** Lo que devuelve `getConsentView`: `disabled` con el MCP apagado, y la página responde 404. */
export type ConsentRead = { readonly kind: "disabled" } | ConsentView;

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
      /** D-MCPE-8: `timeEntry.others.view`; solo decide una oración de la pantalla. */
      readonly seesTeam: boolean;
    };

export const decideConsentInput = z.object({
  oauthQuery: z.string().min(1).max(8192),
  accept: z.boolean(),
});
export type DecideConsentInput = z.infer<typeof decideConsentInput>;
/** La dirección a la que el navegador sigue: el `url` del plugin, con el código o con `access_denied`. */
export type DecideConsentResult = { readonly redirectTo: string };

export type McpErrorCode = ActionErrorCode | "consent_expired";
