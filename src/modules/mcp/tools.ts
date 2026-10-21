import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { failureOf, type ActionMessages } from "@/server/failure";
import type { McpContext } from "@/server/mcp-context";
import { dayKey, weekStartKey, wholeMinutes } from "@/server/time";
import { timeSettingsOf } from "@/modules/profile/service";
import { getTrackingCatalog } from "@/modules/project/service";
import * as operations from "@/modules/time-entry/operations";
import {
  timeEntryMessages,
  type TimeEntryView,
  type UpdateEntryChanges,
} from "@/modules/time-entry/schema";

import {
  createEntryToolInput,
  deleteEntryToolInput,
  deleteEntryToolOutput,
  entryToolOutput,
  getContextToolOutput,
  listEntriesToolInput,
  listEntriesToolOutput,
  listProjectsToolOutput,
  mcpMessages,
  startTimerToolInput,
  startTimerToolOutput,
  stopTimerToolInput,
  stopTimerToolOutput,
  updateEntryToolInput,
  type DeleteEntryToolOutput,
  type EntryToolOutput,
  type GetContextToolOutput,
  type ListEntriesToolOutput,
  type ListProjectsToolOutput,
  type StartTimerToolOutput,
  type StopTimerToolOutput,
  type ToolEntry,
  type UpdateEntryToolInput,
} from "./schema";

/** Los textos de las herramientas sobre entradas, los mismos que la pantalla. */
const entryMessages: ActionMessages = {
  forbidden: timeEntryMessages.forbidden,
  unexpected: timeEntryMessages.unexpected,
};

/** Los de las lecturas que no son de entradas. */
const contextMessages: ActionMessages = {
  forbidden: mcpMessages.grantForbidden,
  unexpected: mcpMessages.unexpected,
};

/** Lo que repiten las descripciones que leen o escriben horas. */
const WALL_CLOCK =
  "Las horas son de pared, HH:mm de 24 h, en la zona de la persona que devuelve get_context.";

/** Una entrada, como la ve el asistente. */
export function toolEntryOf(view: TimeEntryView): ToolEntry {
  return {
    id: view.id,
    description: view.description,
    date: view.dayDate,
    start: view.startClock,
    end: view.endClock,
    extraDays: view.extraDays,
    startedAt: view.startedAt,
    endedAt: view.endedAt,
    durationMinutes:
      view.durationSeconds === null ? null : wholeMinutes(view.durationSeconds),
    running: view.endedAt === null,
    project:
      view.project === null ? null : { id: view.project.id, name: view.project.name },
    task: view.task,
    billable: view.billable,
    tags: view.tags,
  };
}

/**
 * D-MCP-8: los grupos de campos que cambian, con solo los presentes; `tagIds`
 * va como `tags`. Sin ninguno, la operación responde `bulkNoChanges`.
 */
export function updateChangesOf(input: UpdateEntryToolInput): UpdateEntryChanges {
  return {
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.project === undefined ? {} : { project: input.project }),
    ...(input.times === undefined ? {} : { times: input.times }),
    ...(input.runningStart === undefined ? {} : { runningStart: input.runningStart }),
    ...(input.billable === undefined ? {} : { billable: input.billable }),
    ...(input.tagIds === undefined ? {} : { tags: input.tagIds }),
  };
}

/** D-MCP-9: corre el trabajo y traduce cualquier error con `failureOf`. */
export async function runTool<T, Out extends Record<string, unknown>>(
  work: () => Promise<T>,
  present: (value: T) => Out,
  messages: ActionMessages,
): Promise<CallToolResult> {
  try {
    const structured = present(await work());
    return {
      content: [{ type: "text", text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  } catch (error) {
    const failure = failureOf(error, messages);
    // Un error de dominio es un resultado, no un error de JSON-RPC: el asistente
    // lee el texto y corrige.
    return {
      isError: true,
      content: [{ type: "text", text: failure.message }],
      structuredContent: {
        code: failure.code,
        message: failure.message,
        ...(failure.rejections === undefined ? {} : { rejections: failure.rejections }),
      },
    };
  }
}

/**
 * D-MCP-8, D-MCP-9: registra las ocho herramientas sobre `server`, con el contexto
 * del pedido. Cada una mapea su entrada a la del módulo, llama a `operations` o a
 * `getTrackingCatalog`, y devuelve el resultado de `runTool`.
 */
export function registerTools(server: McpServer, context: McpContext): void {
  server.registerTool(
    "get_context",
    {
      title: "Contexto",
      description:
        "Quién es la persona, su zona horaria, el día de hoy y el instante actual en esa zona, el primer día de la semana en curso y el timer que corre. Llamala antes de leer o cargar horas: todas las horas se interpretan en esa zona.",
      outputSchema: getContextToolOutput,
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool(
        () => operations.getRunningEntry(context),
        (running): GetContextToolOutput => {
          const settings = timeSettingsOf(context);
          const now = new Date();
          const today = dayKey(now, settings.timezone);
          return {
            user: { name: context.user.name, email: context.user.email },
            timezone: settings.timezone,
            today,
            now: now.toISOString(),
            weekStart: weekStartKey(today, settings.weekStart),
            running: running === null ? null : toolEntryOf(running),
          };
        },
        contextMessages,
      ),
  );

  server.registerTool(
    "list_projects",
    {
      title: "Proyectos y etiquetas",
      description:
        "Los proyectos en los que la persona puede cargar horas, agrupados por cliente, con sus tareas y si son facturables por defecto, y las etiquetas. Los ids sirven para create_entry, update_entry y start_timer.",
      outputSchema: listProjectsToolOutput,
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool(
        () => getTrackingCatalog(context.actor),
        (catalog): ListProjectsToolOutput => ({
          groups: catalog.groups.map((group) => ({
            client:
              group.client === null
                ? null
                : { id: group.client.id, name: group.client.name },
            projects: group.projects.map((project) => ({
              id: project.id,
              name: project.name,
              billableByDefault: project.billableByDefault,
              tasks: project.tasks.map((task) => ({ id: task.id, name: task.name })),
            })),
          })),
          tags: catalog.tags.map((tag) => ({ id: tag.id, name: tag.name })),
        }),
        contextMessages,
      ),
  );

  server.registerTool(
    "list_entries",
    {
      title: "Entradas de un período",
      description: `Las entradas propias que empiezan entre from y to, los dos incluidos, hasta 31 días; cada una cuenta entera en el día en que empieza. Trae aparte el timer que corre y el total en minutos de las cerradas. Con truncated en true hay más de las que se devolvieron: pedí un período más corto. ${WALL_CLOCK}`,
      inputSchema: listEntriesToolInput,
      outputSchema: listEntriesToolOutput,
      annotations: { readOnlyHint: true },
    },
    (input) =>
      runTool(
        () => operations.listEntriesOfPeriod(context, input),
        (period): ListEntriesToolOutput => ({
          timezone: timeSettingsOf(context).timezone,
          from: period.from,
          to: period.to,
          entries: period.entries.map(toolEntryOf),
          running: period.running === null ? null : toolEntryOf(period.running),
          totalMinutes: wholeMinutes(period.closedSeconds),
          truncated: period.truncated,
        }),
        entryMessages,
      ),
  );

  server.registerTool(
    "create_entry",
    {
      title: "Cargar una entrada",
      description: `Carga una entrada cerrada con día, inicio y fin. Un fin menor que el inicio es del día siguiente. Sin billable, se usa el del proyecto. Si reintentás la misma carga, mandá el id que devolvió la primera respuesta, o uno propio desde el principio: un id repetido no crea dos veces. ${WALL_CLOCK}`,
      inputSchema: createEntryToolInput,
      outputSchema: entryToolOutput,
    },
    (input) =>
      runTool(
        () =>
          operations.createManualEntry(context, {
            ...input,
            id: input.id ?? crypto.randomUUID(),
          }),
        (result): EntryToolOutput => ({ entry: toolEntryOf(result.created) }),
        entryMessages,
      ),
  );

  server.registerTool(
    "update_entry",
    {
      title: "Editar una entrada",
      description: `Cambia los grupos de campos que se mandan, todos juntos o ninguno; los que no se mandan quedan como están. times es de una entrada cerrada y runningStart del timer que corre. tagIds reemplaza el conjunto entero. ${WALL_CLOCK}`,
      inputSchema: updateEntryToolInput,
      outputSchema: entryToolOutput,
      annotations: { idempotentHint: true },
    },
    (input) =>
      runTool(
        () =>
          operations.updateEntry(context, {
            id: input.id,
            changes: updateChangesOf(input),
          }),
        (result): EntryToolOutput => ({ entry: toolEntryOf(result.entry) }),
        entryMessages,
      ),
  );

  server.registerTool(
    "delete_entry",
    {
      title: "Borrar una entrada",
      description: "Borra una entrada propia. No se puede deshacer.",
      inputSchema: deleteEntryToolInput,
      outputSchema: deleteEntryToolOutput,
      annotations: { destructiveHint: true },
    },
    (input) =>
      runTool(
        () => operations.deleteEntry(context, input),
        (result): DeleteEntryToolOutput => ({ id: result.id }),
        entryMessages,
      ),
  );

  server.registerTool(
    "start_timer",
    {
      title: "Iniciar el timer",
      description:
        "Arranca un timer ahora. Si ya corría otro, lo cierra en el mismo instante y lo devuelve en stopped. Sin billable, se usa el del proyecto. Un id repetido no crea dos veces.",
      inputSchema: startTimerToolInput,
      outputSchema: startTimerToolOutput,
    },
    (input) =>
      runTool(
        () =>
          operations.startTimer(context, {
            ...input,
            id: input.id ?? crypto.randomUUID(),
          }),
        (result): StartTimerToolOutput => ({
          running: toolEntryOf(result.running),
          stopped: result.stopped === null ? null : toolEntryOf(result.stopped),
        }),
        entryMessages,
      ),
  );

  server.registerTool(
    "stop_timer",
    {
      title: "Detener el timer",
      description: "Detiene el timer ahora: el del id, o el que corre si no se manda.",
      inputSchema: stopTimerToolInput,
      outputSchema: stopTimerToolOutput,
    },
    (input) =>
      runTool(
        () => operations.stopRunningTimer(context, input),
        (result): StopTimerToolOutput => ({ stopped: toolEntryOf(result.stopped) }),
        entryMessages,
      ),
  );
}
