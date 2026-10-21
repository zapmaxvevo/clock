import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { failureOf, type ActionMessages } from "@/server/failure";
import type { McpContext } from "@/server/mcp-context";
import { dayKey, weekStartKey, wholeMinutes } from "@/server/time";
import { timeSettingsOf } from "@/modules/profile/service";
import { getTrackingCatalog } from "@/modules/project/service";
import * as reportOperations from "@/modules/report/operations";
import {
  reportMessages,
  type PeopleCatalog,
  type ReportGroup,
  type ReportReadyState,
} from "@/modules/report/schema";
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
  listPeopleToolOutput,
  listProjectsToolOutput,
  mcpMessages,
  startTimerToolInput,
  startTimerToolOutput,
  stopTimerToolInput,
  stopTimerToolOutput,
  summarizeHoursToolInput,
  summarizeHoursToolOutput,
  updateEntryToolInput,
  type DeleteEntryToolOutput,
  type EntryToolOutput,
  type GetContextToolOutput,
  type ListEntriesToolOutput,
  type ListPeopleToolOutput,
  type ListProjectsToolOutput,
  type StartTimerToolOutput,
  type StopTimerToolOutput,
  type SummarizeHoursToolOutput,
  type SummaryGroup,
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

/**
 * D-MCPE-4: los de las lecturas del reporte. El `forbidden` de un
 * `ForbiddenError` solo puede venir de `report.view`; el de horas ajenas, el
 * `not_found` y el `timeout` son `ReportError` y traen su texto.
 */
export const reportToolMessages: ActionMessages = {
  forbidden: reportMessages.viewForbidden,
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

/** D-MCPE-5: lo que dice un grupo de sí mismo, sin el nivel de abajo. */
function summaryFieldsOf(group: ReportGroup): Omit<SummaryGroup, "children"> {
  const minutes = wholeMinutes(group.seconds);
  switch (group.kind) {
    case "person":
      return {
        kind: group.kind,
        key: group.userId,
        name: group.name,
        minutes,
        inactive: group.inactive,
      };
    case "project":
      return {
        kind: group.kind,
        key: group.project?.id ?? null,
        name: group.project?.name ?? null,
        minutes,
        client: group.client?.name ?? null,
      };
    case "client":
      return {
        kind: group.kind,
        key: group.client?.id ?? null,
        name: group.client?.name ?? null,
        minutes,
      };
    case "task":
      return {
        kind: group.kind,
        key: group.task?.id ?? null,
        name: group.task?.name ?? null,
        minutes,
        project: group.project?.name ?? null,
      };
    case "tag":
      return {
        kind: group.kind,
        key: group.tag?.id ?? null,
        name: group.tag?.name ?? null,
        minutes,
      };
    case "date":
      return { kind: group.kind, key: group.dayKey, name: group.dayKey, minutes };
    case "week":
      return { kind: group.kind, key: group.weekStart, name: group.weekStart, minutes };
    case "month":
      return { kind: group.kind, key: group.monthStart, name: group.monthStart, minutes };
    case "description":
      return {
        kind: group.kind,
        key: group.description?.id ?? null,
        name: group.description?.text ?? null,
        minutes,
        truncated: group.description?.truncated ?? false,
      };
  }
}

/**
 * D-MCPE-5: un grupo del reporte como lo ve el asistente, con los de abajo si
 * la vista los trae. Sin rótulos de pantalla ni colores.
 */
export function summaryGroupOf(group: ReportGroup): SummaryGroup {
  const fields = summaryFieldsOf(group);
  return group.children === undefined
    ? fields
    : { ...fields, children: group.children.map(summaryGroupOf) };
}

/** D-MCPE-5: el resumido en minutos enteros, sin el gráfico. */
export function summaryOf(report: ReportReadyState): SummarizeHoursToolOutput {
  return {
    timezone: report.timeZone,
    from: report.range.first,
    to: report.range.last,
    scope: report.scope,
    groupBy: report.groupBy,
    subgroups: report.subgroups,
    levelsShown: report.levelsShown,
    totalMinutes: wholeMinutes(report.totalSeconds),
    billableMinutes: wholeMinutes(report.billableSeconds),
    groups: report.groups.map(summaryGroupOf),
  };
}

/**
 * D-MCPE-2: el catálogo de personas, campo por campo: una lista blanca, para
 * que un campo que `PeopleCatalogPerson` sume no llegue al asistente sin un
 * cambio acá.
 */
export function peopleListOf(catalog: PeopleCatalog): ListPeopleToolOutput {
  return {
    scope: catalog.scope,
    people: catalog.people.map(({ id, name, email, inactive, self }) => ({
      id,
      name,
      email,
      inactive,
      self,
    })),
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
 * D-MCP-8, D-MCP-9, D-MCPE-1: registra las diez herramientas sobre `server`, con
 * el contexto del pedido. Cada una mapea su entrada a la del módulo, llama a
 * `operations`, a `reportOperations` o a `getTrackingCatalog`, y devuelve el
 * resultado de `runTool`.
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
      description: `Las entradas propias que empiezan entre from y to, los dos incluidos, hasta 31 días; cada una cuenta entera en el día en que empieza. Trae aparte el timer que corre y el total en minutos de las cerradas. Con truncated en true hay más de las que se devolvieron: pedí un período más corto. ${WALL_CLOCK} Para las horas de otras personas, summarize_hours.`,
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
    "list_people",
    {
      title: "Personas del equipo",
      description:
        "Las personas cuyas horas puede consultar la persona con summarize_hours, con el id que pide userIds, el nombre, si está inactiva y cuál es ella misma. El correo viene solo si la persona administra el equipo y no se liberó; si no, null. Con scope everyone son todas las del workspace, activas e inactivas; con scope self, solo ella.",
      outputSchema: listPeopleToolOutput,
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool(
        () => reportOperations.listPeople(context),
        peopleListOf,
        reportToolMessages,
      ),
  );

  server.registerTool(
    "summarize_hours",
    {
      title: "Resumen de horas",
      description:
        "Las horas cerradas que empiezan entre from y to, los dos incluidos, hasta 366 días, sumadas en minutos y agrupadas en hasta tres niveles, como el reporte de Clock. Con scope everyone se ve a todo el workspace y se puede filtrar por userIds de list_people; con scope self, solo lo propio. El timer que corre no cuenta. Cada grupo redondea sus minutos hacia abajo por separado. Para saber qué hizo alguien cada día, agrupá por person, date y description. La respuesta tiene un tope de 500 grupos entre todos los niveles: si levelsShown es menor que los niveles pedidos, no entraron todos; volvé a pedir con userIds de una o pocas personas, o con dos niveles en lugar de tres, o con un período más corto. Los días se cortan en la zona de la persona que devuelve get_context.",
      inputSchema: summarizeHoursToolInput,
      outputSchema: summarizeHoursToolOutput,
      annotations: { readOnlyHint: true },
    },
    (input) =>
      runTool(
        () => reportOperations.summarizeHours(context, input),
        summaryOf,
        reportToolMessages,
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
