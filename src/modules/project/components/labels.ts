import type { ProjectFilter } from "@/modules/project/schema";

/**
 * Textos de la pantalla de proyectos y del selector de proyecto. Los mensajes
 * de error de las actions no viven acá: salen de `projectMessages`, en el
 * esquema del módulo.
 */
export const projectLabels = {
  title: "Proyectos",
  /** PR-04: cada entidad se crea desde un solo lugar. */
  newClient: "Nuevo cliente",
  newProject: "Nuevo proyecto",
  newTask: "Nueva tarea",
  /** D-P1-7: el texto del botón de la fila; su nombre accesible es `editProjectLabel`. */
  edit: "Editar",
  /** D-P1-8: el título del diálogo de edición. */
  editProject: "Editar proyecto",
  /** PR-14 y PR-97: el grupo de los proyectos sin cliente y su opción en el diálogo. */
  noClient: "Sin cliente",
  /** PR-85: ningún proyecto visible. */
  empty: "Todavía no hay proyectos",
  /** PR-89: con «Activos» y todos archivados. */
  noActive: "No hay proyectos activos",
  noActiveHint: "Elegí «Archivados» o «Todos» en el estado para verlos.",
  /** D-P1-6: con «Archivados» y ninguno. */
  noArchived: "No hay proyectos archivados",
  /** PR-31: el buscador y el filtro de la lista. */
  searchProjects: "Buscar proyecto o cliente",
  statusFilter: "Estado",
  /** PR-31: las columnas de la tabla; la de acciones solo la lee el lector de pantalla. */
  columns: {
    name: "Nombre",
    client: "Cliente",
    access: "Acceso",
    tasks: "Tareas",
    actions: "Acciones",
  },
  /** PR-16 y PR-17: la columna «Acceso». */
  public: "Público",
  private: "Privado",
  /** PR-31: la marca de un archivado con «Todos». */
  archived: "Archivado",
  /** Los campos de los tres diálogos. */
  name: "Nombre",
  address: "Dirección",
  note: "Nota",
  client: "Cliente",
  color: "Color",
  /** PR-15: si no se elige color, lo asigna el servidor. */
  colorHint: "Si no elegís uno, se asigna automáticamente.",
  /** PR-21: la casilla del alta de proyecto. */
  billableByDefault: "Facturable por defecto",
  billableByDefaultHint: "Las entradas nuevas con este proyecto arrancan facturables.",
  /** El aviso de error nombra la operación que no se hizo. */
  clientNotCreated: "No se pudo crear el cliente.",
  projectNotCreated: "No se pudo crear el proyecto.",
  taskNotCreated: "No se pudo crear la tarea.",
  /** TT-90: la edición de un proyecto. */
  projectNotSaved: "No se pudieron guardar los cambios.",
  save: "Guardar",
  saving: "Guardando…",
  cancel: "Cancelar",
  /** Lo que anuncia la pantalla mientras el catálogo carga en el servidor. */
  loading: "Cargando los proyectos",
  /** TT-06: el disparador del selector de la barra, sin selección. */
  pickerEmpty: "Proyecto",
  /** TT-10 y TT-50: la opción del selector y la entrada sin proyecto. */
  noProject: "Sin proyecto",
  /** TT-07: el buscador del selector. */
  pickerSearch: "Buscar proyecto, cliente o tarea",
  /** TT-87: el selector de un workspace sin proyectos. */
  pickerNoProjects: "No hay proyectos todavía",
  /** TT-88: el selector de etiquetas vacío; el de proyecto ofrece crear (TT-87). */
  pickerGoToProjects: "Ir a Proyectos",
  /** TT-09: la última opción del selector, con `project.create`. */
  pickerCreateProject: "Crear proyecto",
  /** TT-07: la búsqueda del selector sin coincidencias. */
  pickerNoMatches: "Ningún proyecto coincide con la búsqueda.",
  /** TS-18: el selector de una fila nueva de la planilla, con todo ya usado. */
  pickerAllUsed: "Todas las combinaciones ya tienen fila esta semana.",
  /**
   * TT-12: el disparador del selector de la barra sin etiquetas, el campo del
   * diálogo del calendario, el de solo lectura y el detalle del bloque, y la
   * sección de `/proyectos` (PR-112).
   */
  tags: "Etiquetas",
  /** PR-112 y D-1: las etiquetas se crean desde `/proyectos`. */
  newTag: "Nueva etiqueta",
  tagNotCreated: "No se pudo crear la etiqueta.",
  /** H-13 y PR-88: ninguna etiqueta activa. */
  tagsEmpty: "Todavía no hay etiquetas",
  /** H-2: el buscador del selector de etiquetas. */
  tagPickerSearch: "Buscar etiqueta",
  /** TT-88: el selector de un workspace sin etiquetas. */
  tagPickerNoTags: "No hay etiquetas todavía",
  tagPickerNoMatches: "Ninguna etiqueta coincide con la búsqueda.",
} as const;

/** PR-31: los tres valores del filtro de estado, como los dice el selector. */
export const projectFilterNames = {
  activos: "Activos",
  archivados: "Archivados",
  todos: "Todos",
} as const satisfies { readonly [F in ProjectFilter]: string };

/**
 * PR-62: un cliente sin proyectos no aparece en la lista, así que el alta se
 * confirma con un anuncio que lo nombra.
 */
export function clientCreatedLabel(name: string): string {
  return `Cliente «${name}» creado`;
}

/** PR-112: la lista ya muestra la etiqueta nueva; el anuncio confirma el alta. */
export function tagCreatedLabel(name: string): string {
  return `Etiqueta «${name}» creada`;
}

/**
 * «Etiquetas: a, b». El nombre accesible del disparador del selector dice
 * también las elegidas, que a la vista pueden quedar recortadas (TT-12, H-1);
 * el detalle del bloque del calendario las nombra igual (CAL-23).
 */
export function withTagNames(label: string, names: readonly string[]): string {
  return names.length === 0 ? label : `${label}: ${names.join(", ")}`;
}

/** H-5 y PR-47: la etiqueta de una entrada que ya no está en el catálogo. */
export function archivedTagLabel(name: string): string {
  return `${name} (archivada)`;
}

/** D-P1-7: el nombre accesible de «Editar» dice qué proyecto edita. */
export function editProjectLabel(projectName: string): string {
  return `${projectLabels.edit} «${projectName}»`;
}

/** D-P1-8: la fila ya muestra lo nuevo; el anuncio confirma la edición. */
export function projectSavedLabel(name: string): string {
  return `Proyecto «${name}» guardado`;
}

/** D-P1-9: el cliente archivado de un proyecto, en el selector de la edición. */
export function archivedClientLabel(name: string): string {
  return `${name} (archivado)`;
}

/** El nombre accesible de «Nueva tarea» dice a qué proyecto se suma. */
export function newTaskLabel(projectName: string): string {
  return `${projectLabels.newTask} en «${projectName}»`;
}

/** La lista de tareas de un proyecto, nombrada por su proyecto. */
export function tasksLabel(projectName: string): string {
  return `Tareas de «${projectName}»`;
}

/** El punto de color no depende solo del color: dice cuál es. */
export function colorDotLabel(colorName: string): string {
  return `${projectLabels.color}: ${colorName}`;
}

/** TT-06: el proyecto con su tarea, en el disparador y en la opción de la tarea. */
export function projectTaskLabel(projectName: string, taskName: string): string {
  return `${projectName}: ${taskName}`;
}
