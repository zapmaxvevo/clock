import { z } from "zod";

import type { BillableSource } from "@/lib/billable";
import { noNullCharacter } from "@/lib/text";
import type { ActionResult } from "@/server/action";

import { PALETTE_KEYS, type PaletteKey } from "./palette";

/** Largo máximo del nombre de cliente, proyecto y tarea (P-20). Lo repite un `check`. */
export const NAME_MAX = 100;

/** Largo máximo de la dirección y la nota. Lo repite un `check`. */
export const LONG_TEXT_MAX = 3000;

/** Textos que la interfaz muestra tal cual (`proyectos.md`, §9). */
export const projectMessages = {
  projectUnavailable: "Ese proyecto ya no está disponible.",
  taskUnavailable: "Esa tarea ya no está disponible.",
  clientUnavailable: "Ese cliente ya no está disponible.",
  nameRequired: "El nombre no puede estar vacío.",
  nameTooLong: "El nombre no puede superar los 100 caracteres.",
  projectNameTaken: "Ya hay un proyecto con ese nombre para ese cliente.",
  clientNameTaken: "Ya hay un cliente con ese nombre.",
  taskNameTaken: "Ya hay una tarea con ese nombre en el proyecto.",
  // TT-78, PR-73.
  tagUnavailable: "Esa etiqueta ya no está disponible.",
  // PR-80.
  tagNameTaken: "Ya hay una etiqueta con ese nombre.",
  forbidden: "No tenés permiso para hacer esto.",
  addressTooLong: "La dirección no puede superar los 3000 caracteres.",
  noteTooLong: "La nota no puede superar los 3000 caracteres.",
  nullCharacter: "El texto tiene un carácter que no se puede guardar.",
  unexpected: "No se pudo guardar. Revisá la conexión y volvé a intentar.",
} as const;

const name = z
  .string()
  .trim()
  .min(1, projectMessages.nameRequired)
  .max(NAME_MAX, projectMessages.nameTooLong)
  .refine(noNullCharacter, projectMessages.nullCharacter);

const longText = (tooLong: string) =>
  z
    .string()
    .trim()
    .max(LONG_TEXT_MAX, tooLong)
    .refine(noNullCharacter, projectMessages.nullCharacter);

export const createClientInput = z.object({
  /** ADR 0007: lo genera el cliente, uno por acción de la persona. */
  id: z.uuidv4(),
  name,
  address: longText(projectMessages.addressTooLong).default(""),
  note: longText(projectMessages.noteTooLong).default(""),
});

export const createProjectInput = z.object({
  id: z.uuidv4(),
  name,
  clientId: z.uuid().nullable(),
  /** Una clave de la paleta, o `null` para que la asigne el servidor. */
  color: z.enum(PALETTE_KEYS).nullable(),
  note: longText(projectMessages.noteTooLong).default(""),
  /** PR-21: con qué facturable arrancan las entradas nuevas con este proyecto. */
  billableByDefault: z.boolean().default(false),
});

export const createTaskInput = z.object({
  id: z.uuidv4(),
  projectId: z.uuid(),
  name,
});

/** PR-43: una etiqueta es solo su nombre. */
export const createTagInput = z.object({
  id: z.uuidv4(),
  name,
});

export type CreateClientInput = z.input<typeof createClientInput>;
/** Lo que recibe el service: los textos ya recortados y con su default. */
export type CreateClientValues = z.output<typeof createClientInput>;
export type CreateProjectInput = z.input<typeof createProjectInput>;
export type CreateProjectValues = z.output<typeof createProjectInput>;
export type CreateTaskInput = z.input<typeof createTaskInput>;
export type CreateTaskValues = z.output<typeof createTaskInput>;
export type CreateTagInput = z.input<typeof createTagInput>;
export type CreateTagValues = z.output<typeof createTagInput>;

export type ClientView = { readonly id: string; readonly name: string };

/** Sin estado: la lectura solo devuelve tareas activas. */
export type TaskView = { readonly id: string; readonly name: string };

export type ProjectView = {
  readonly id: string;
  readonly name: string;
  readonly color: PaletteKey;
  readonly isPublic: boolean;
  readonly canCreateTask: boolean;
  /** Tareas activas, en orden alfabético. */
  readonly tasks: readonly TaskView[];
};

export type ProjectGroupView = {
  /** `null` es el grupo «Sin cliente». */
  readonly client: ClientView | null;
  readonly projects: readonly ProjectView[];
};

/** Lo que se muestra y se elige de una etiqueta (PR-43). */
export type TagRef = { readonly id: string; readonly name: string };

export type ProjectCatalog = {
  readonly canCreateClient: boolean;
  readonly canCreateProject: boolean;
  /** PR-112: «Nueva etiqueta». */
  readonly canCreateTag: boolean;
  /** Las activas, en orden alfabético; vacío sin `tag.view` (PR-62, PR-60). */
  readonly tags: readonly TagRef[];
  /** Clientes activos del workspace, para el diálogo de proyecto. Orden alfabético. */
  readonly clients: readonly ClientView[];
  /** Proyectos que quien pide puede ver, agrupados por cliente. «Sin cliente» al final. */
  readonly groups: readonly ProjectGroupView[];
};

/** Lo que una entrada muestra de su proyecto. */
export type ProjectRef = {
  readonly id: string;
  readonly name: string;
  readonly color: PaletteKey;
};

export type TaskRef = { readonly id: string; readonly name: string };

/** Un cliente en el filtro de un reporte, con su marca de archivado (RP-29). */
export type FilterClientView = ClientView & { readonly archived: boolean };

/** Un proyecto en el filtro de un reporte, con su cliente y su marca de archivado (RP-29). */
export type FilterProjectView = ProjectRef & {
  readonly client: ClientView | null;
  readonly archived: boolean;
};

/** Lo que ofrecen los filtros de cliente y de proyecto de un reporte (RP-25). */
export type ProjectFilterCatalog = {
  readonly clients: readonly FilterClientView[];
  readonly projects: readonly FilterProjectView[];
};

/** Lo que elige el selector. `task` no nulo implica `project` no nulo (TT-11). */
export type ProjectSelection = {
  readonly project: ProjectRef | null;
  readonly task: TaskRef | null;
};

export type TrackingProjectView = ProjectRef & {
  /** Tareas activas, en orden alfabético (PR-99). Vacío: se elige el proyecto solo (PR-87). */
  readonly tasks: readonly TaskRef[];
  /** PR-21: el navegador aplica `billableFor` al elegirlo. */
  readonly billableByDefault: boolean;
};

/** Lo que una entrada necesita del proyecto que se le asigna. */
export type TrackableProject = BillableSource;

export type TrackingGroupView = {
  /** `null` es «Sin cliente», que va al final (PR-14, PR-97). */
  readonly client: ClientView | null;
  readonly projects: readonly TrackingProjectView[];
};

/** El catálogo del selector de proyecto del rastreador. */
export type TrackingCatalog = {
  /** TT-87: el enlace a `/proyectos` del selector vacío. */
  readonly canCreateProject: boolean;
  /** TT-88: el enlace a `/proyectos` del selector de etiquetas vacío. */
  readonly canCreateTag: boolean;
  /** Las activas, en orden alfabético; vacío sin `tag.view` (PR-62, PR-60). */
  readonly tags: readonly TagRef[];
  /** Proyectos activos en los que quien pide puede cargar horas (TT-08), por cliente. */
  readonly groups: readonly TrackingGroupView[];
};

export type CreateClientResult = { readonly client: ClientView };

/** Un proyecto recién creado, o el de un reintento, llega con `tasks` vacío. */
export type CreateProjectResult = { readonly project: ProjectView };

export type CreateTaskResult = { readonly task: TaskView };

export type CreateTagResult = { readonly tag: TagRef };

/** Las cuatro actions, como las recibe la pantalla por props desde `page.tsx`. */
export type ProjectActions = {
  readonly createClient: (
    input: CreateClientInput,
  ) => Promise<ActionResult<CreateClientResult>>;
  readonly createProject: (
    input: CreateProjectInput,
  ) => Promise<ActionResult<CreateProjectResult>>;
  readonly createTask: (
    input: CreateTaskInput,
  ) => Promise<ActionResult<CreateTaskResult>>;
  readonly createTag: (input: CreateTagInput) => Promise<ActionResult<CreateTagResult>>;
};
