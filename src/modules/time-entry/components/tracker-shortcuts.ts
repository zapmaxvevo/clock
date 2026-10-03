/**
 * TT-26: los atajos de una tecla del rastreador. Cada uno equivale a un control
 * visible —«Iniciar», «Detener», el conmutador de modo y el botón de continuar
 * de la última entrada— y el componente que lo atiende decide si ese control
 * está habilitado. Acá vive solo qué tecla es qué y dónde no se atiende.
 */
export type TrackerShortcut = "start" | "stop" | "toggleMode" | "continueLast";

/** Sin distinguir mayúsculas: con Bloq Mayús la tecla llega como «N». */
function shortcutForKey(key: string): TrackerShortcut | null {
  switch (key.toLowerCase()) {
    case "n":
      return "start";
    case "s":
      return "stop";
    case "m":
      return "toggleMode";
    case "c":
      return "continueLast";
    default:
      return null;
  }
}

/**
 * Dónde una letra es texto o navegación y no un atajo: los campos, los
 * diálogos —también los popovers, que Base UI dibuja con rol `dialog`—, los
 * menús abiertos, el calendario y los editores del slice 3, que marcan su raíz
 * para cubrir los controles que no son campos de texto, como el botón de fecha.
 */
const IGNORED_SCOPES = [
  "input",
  "textarea",
  "select",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[role='listbox']",
  "[role='grid']",
  "[data-tracker-shortcuts='off']",
].join(", ");

/**
 * Lo que `shortcutOf` necesita del destino. Se pregunta por la forma y no con
 * `instanceof Element` para que la regla sea pura: el test de unidad corre
 * sin DOM y le pasa destinos armados a mano. Un elemento del DOM la cumple; el
 * `document` o la ventana, que no tienen `closest`, no están dentro de nada.
 */
type ScopedTarget = {
  closest(selectors: string): unknown;
  readonly isContentEditable?: boolean;
};

function isScopedTarget(
  target: EventTarget | null,
): target is EventTarget & ScopedTarget {
  return target !== null && "closest" in target && typeof target.closest === "function";
}

function isIgnoredTarget(target: EventTarget | null): boolean {
  if (!isScopedTarget(target)) {
    return false;
  }
  return target.isContentEditable === true || target.closest(IGNORED_SCOPES) !== null;
}

/** La tecla de un evento, o `null` si no es un atajo o no corresponde atenderlo. */
export function shortcutOf(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly target: EventTarget | null;
}): TrackerShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return null;
  }
  if (event.repeat || event.isComposing || isIgnoredTarget(event.target)) {
    return null;
  }
  return shortcutForKey(event.key);
}

/** Clave de `localStorage` del interruptor. */
export const SHORTCUTS_STORAGE_KEY = "clock.tracker-shortcuts";

/** Evento propio de `window`: `storage` no se dispara en la pestaña que escribió. */
export const SHORTCUTS_CHANGE_EVENT = "clock:tracker-shortcuts";

/** Lo que el interruptor guarda en `localStorage`. */
export function storedShortcutsValue(enabled: boolean): string {
  return enabled ? "on" : "off";
}

/** El valor guardado, leído. Solo `"off"` los apaga: ausente o desconocido es «activos». */
export function shortcutsEnabledFrom(stored: string | null): boolean {
  return stored !== storedShortcutsValue(false);
}
