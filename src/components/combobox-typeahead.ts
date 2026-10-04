import type { KeyboardEvent } from "react";

/**
 * Para el `onKeyDown` del disparador de un `Combobox`. Una tecla imprimible
 * sobre el disparador cerrado elegiría la opción que empieza con esa letra
 * (typeahead de la primitiva): el valor cambiaría sin abrir el selector. El
 * espacio sigue abriéndolo.
 */
export function preventTypeahead(
  event: KeyboardEvent<HTMLButtonElement> & { preventBaseUIHandler: () => void },
): void {
  if (event.key.length === 1 && event.key !== " ") {
    event.preventBaseUIHandler();
  }
}
