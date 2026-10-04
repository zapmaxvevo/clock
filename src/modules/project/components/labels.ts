/**
 * Textos de la pantalla de proyectos. Los mensajes de error de las actions no
 * viven acá: salen de `projectMessages`, en el esquema del módulo.
 */
export const projectLabels = {
  title: "Proyectos",
  /** PR-04: cada entidad se crea desde un solo lugar. */
  newClient: "Nuevo cliente",
  newProject: "Nuevo proyecto",
  newTask: "Nueva tarea",
  /** PR-14 y PR-97: el grupo de los proyectos sin cliente y su opción en el diálogo. */
  noClient: "Sin cliente",
  /** PR-85: ningún proyecto visible. */
  empty: "Todavía no hay proyectos",
  /** Los campos de los tres diálogos. */
  name: "Nombre",
  address: "Dirección",
  note: "Nota",
  client: "Cliente",
  color: "Color",
  /** PR-15: si no se elige color, lo asigna el servidor. */
  colorHint: "Si no elegís uno, se asigna automáticamente.",
  /** El aviso de error nombra la operación que no se hizo. */
  clientNotCreated: "No se pudo crear el cliente.",
  projectNotCreated: "No se pudo crear el proyecto.",
  taskNotCreated: "No se pudo crear la tarea.",
  save: "Guardar",
  saving: "Guardando…",
  cancel: "Cancelar",
  /** Lo que anuncia la pantalla mientras el catálogo carga en el servidor. */
  loading: "Cargando los proyectos",
} as const;

/**
 * PR-62: un cliente sin proyectos no aparece en la lista, así que el alta se
 * confirma con un anuncio que lo nombra.
 */
export function clientCreatedLabel(name: string): string {
  return `Cliente «${name}» creado`;
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
