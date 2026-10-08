/** Los botones de cada entrada de la lista, adonde puede volver el foco. */
export type EntryButton = "edit" | "delete";

/** La entrada de un diálogo: lo único que el foco necesita de ella. */
type FocusEntry = { readonly entry: { readonly id: string } };

/** El editor, según cómo se abrió y cómo se cerró. */
export type EditorFocus = FocusEntry & {
  /** Desde el menú de la celda (TS-41) o desde la lista (TS-42). */
  readonly origin: "menu" | "list";
  /** Lo cerró el dueño: se asentó, una falla de `CLOSING_CODES` o «Borrar» de su menú. */
  readonly closedBy: "saved" | "failed" | "delete" | null;
};

/** Desde dónde se abrió la confirmación del borrado. */
export type ConfirmOrigin =
  | { readonly origin: "menu" }
  /** El botón de la lista que abrió la cadena: «Borrar», o «Editar» si pasó por el editor. */
  | { readonly origin: "list"; readonly returnTo: EntryButton };

/** La confirmación del borrado, según desde dónde se abrió y si se confirmó. */
export type ConfirmFocus = FocusEntry & {
  readonly confirmed: boolean;
} & ConfirmOrigin;

/**
 * Lo que el detalle puede enfocar, buscado en el momento en que un diálogo se
 * cierra: entre la apertura y el cierre la foto puede sacar la fila, la
 * entrada o el disparador.
 */
export type FocusPlaces<Target> = {
  /** El disparador del menú de la celda, si sigue en ella. */
  readonly trigger: () => Target | null;
  /** El campo de la celda o, si no se dibuja, el de «Quitar fila» (§5.6). */
  readonly destination: () => Target | null;
  /** El título de la lista. */
  readonly title: () => Target | null;
  /** Un botón de una entrada de la lista, si la entrada sigue en ella. */
  readonly button: (entryId: string, button: EntryButton) => Target | null;
};

/** Cancelar lo abierto desde el menú: al disparador, o al destino si ya no está. */
function triggerTarget<Target>(places: FocusPlaces<Target>): Target | null {
  return places.trigger() ?? places.destination();
}

/** Volver a la lista: al botón de la entrada, o al título si ella salió. */
function listTarget<Target>(
  places: FocusPlaces<Target>,
  entryId: string,
  button: EntryButton,
): Target | null {
  return places.button(entryId, button) ?? places.title();
}

/** §5.6: cancelar el editor. */
export function editorCancelTarget<Target>(
  editor: EditorFocus,
  places: FocusPlaces<Target>,
): Target | null {
  return editor.origin === "menu"
    ? triggerTarget(places)
    : listTarget(places, editor.entry.id, "edit");
}

/** §5.6: el dueño cierra el editor. Con «Borrar» la confirmación toma el foco. */
export function editorCloseTarget<Target>(
  editor: EditorFocus,
  places: FocusPlaces<Target>,
): Target | null {
  if (editor.closedBy === "delete") {
    return null;
  }
  if (editor.origin === "menu") {
    return places.destination();
  }
  return editor.closedBy === "saved"
    ? listTarget(places, editor.entry.id, "edit")
    : places.title();
}

/** §5.6: la confirmación, cancelada o confirmada. */
export function confirmTarget<Target>(
  confirm: ConfirmFocus,
  places: FocusPlaces<Target>,
): Target | null {
  if (confirm.origin === "menu") {
    return confirm.confirmed ? places.destination() : triggerTarget(places);
  }
  return confirm.confirmed
    ? places.title()
    : listTarget(places, confirm.entry.id, confirm.returnTo);
}
