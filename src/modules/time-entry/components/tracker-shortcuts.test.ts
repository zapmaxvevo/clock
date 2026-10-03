import { describe, expect, it } from "vitest";

import {
  shortcutOf,
  shortcutsEnabledFrom,
  storedShortcutsValue,
  type TrackerShortcut,
} from "./tracker-shortcuts";

/** Un nodo del árbol de mentira: etiqueta y atributos, del destino hacia arriba. */
type FakeNode = {
  readonly tag: string;
  readonly attributes?: Readonly<Record<string, string>>;
};

/**
 * Las dos formas de selector que usan las exclusiones: una etiqueta sola o un
 * atributo con valor entre comillas simples.
 */
function matches(node: FakeNode, selector: string): boolean {
  const attribute = /^\[([\w-]+)='([^']*)'\]$/.exec(selector);
  if (attribute === null) {
    return node.tag === selector;
  }
  return node.attributes?.[attribute[1]] === attribute[2];
}

/**
 * Un destino con lo que `shortcutOf` mira de un elemento del DOM. Vitest corre
 * sin DOM, así que `closest` recorre los nodos dados, del primero al último.
 */
function targetIn(
  path: readonly FakeNode[],
  options: { readonly contentEditable?: boolean } = {},
): EventTarget {
  return Object.assign(new EventTarget(), {
    isContentEditable: options.contentEditable ?? false,
    closest(selectors: string): FakeNode | null {
      const list = selectors.split(",").map((selector) => selector.trim());
      return (
        path.find((node) => list.some((selector) => matches(node, selector))) ?? null
      );
    },
  });
}

const body = targetIn([{ tag: "body" }]);
const pageButton = targetIn([{ tag: "button" }, { tag: "main" }, { tag: "body" }]);

function press(
  key: string,
  overrides: Partial<Parameters<typeof shortcutOf>[0]> = {},
): TrackerShortcut | null {
  return shortcutOf({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    target: body,
    ...overrides,
  });
}

describe("shortcutOf: el mapa de teclas", () => {
  it("n inicia, s detiene, m cambia de modo y c continúa la última", () => {
    expect(press("n")).toBe("start");
    expect(press("s")).toBe("stop");
    expect(press("m")).toBe("toggleMode");
    expect(press("c")).toBe("continueLast");
  });

  it("no distingue mayúsculas: con Bloq Mayús la tecla llega en mayúscula", () => {
    expect(press("N")).toBe("start");
    expect(press("S")).toBe("stop");
    expect(press("M")).toBe("toggleMode");
    expect(press("C")).toBe("continueLast");
  });

  it("cualquier otra tecla no es un atajo", () => {
    expect(press("x")).toBeNull();
    expect(press("Enter")).toBeNull();
    expect(press(" ")).toBeNull();
    expect(press("Escape")).toBeNull();
    expect(press("Dead")).toBeNull();
  });

  it("se atiende con el foco en un botón de la página", () => {
    expect(press("n", { target: pageButton })).toBe("start");
  });

  it("se atiende sin destino", () => {
    expect(press("s", { target: null })).toBe("stop");
  });
});

describe("shortcutOf: cuándo no se atiende", () => {
  it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"] as const)(
    "con %s apretada no es un atajo",
    (modifier) => {
      expect(press("n", { [modifier]: true })).toBeNull();
      expect(press("c", { [modifier]: true })).toBeNull();
    },
  );

  it("la tecla mantenida no repite el atajo", () => {
    expect(press("s", { repeat: true })).toBeNull();
  });

  it("con una composición en curso la tecla es del IME", () => {
    expect(press("n", { isComposing: true })).toBeNull();
  });

  it.each(["input", "textarea", "select"])("dentro de un %s es texto", (tag) => {
    expect(press("n", { target: targetIn([{ tag }, { tag: "body" }]) })).toBeNull();
  });

  it("dentro de un elemento editable es texto", () => {
    const editable = targetIn([{ tag: "div" }, { tag: "body" }], {
      contentEditable: true,
    });
    expect(press("m", { target: editable })).toBeNull();
  });

  it.each(["dialog", "alertdialog", "menu", "listbox", "grid"])(
    "dentro de un elemento con rol %s no se atiende",
    (role) => {
      const inside = targetIn([
        { tag: "button" },
        { tag: "div", attributes: { role } },
        { tag: "body" },
      ]);
      expect(press("c", { target: inside })).toBeNull();
    },
  );

  it("dentro de un editor marcado con data-tracker-shortcuts=off no se atiende", () => {
    const dateButton = targetIn([
      { tag: "button" },
      { tag: "div", attributes: { role: "group", "data-tracker-shortcuts": "off" } },
      { tag: "li" },
      { tag: "body" },
    ]);
    expect(press("n", { target: dateButton })).toBeNull();
  });

  it("un rol que no es de diálogo, menú, lista ni grilla no apaga los atajos", () => {
    const inGroup = targetIn([
      { tag: "button" },
      { tag: "div", attributes: { role: "group" } },
      { tag: "body" },
    ]);
    expect(press("n", { target: inGroup })).toBe("start");
  });
});

describe("shortcutsEnabledFrom", () => {
  it("sin valor guardado los atajos están activos", () => {
    expect(shortcutsEnabledFrom(null)).toBe(true);
  });

  it('"on" los deja activos y "off" los apaga', () => {
    expect(shortcutsEnabledFrom("on")).toBe(true);
    expect(shortcutsEnabledFrom("off")).toBe(false);
  });

  it("un valor desconocido no los apaga", () => {
    expect(shortcutsEnabledFrom("")).toBe(true);
    expect(shortcutsEnabledFrom("OFF")).toBe(true);
    expect(shortcutsEnabledFrom("false")).toBe(true);
  });

  it("lo que guarda el interruptor se vuelve a leer igual", () => {
    expect(shortcutsEnabledFrom(storedShortcutsValue(true))).toBe(true);
    expect(shortcutsEnabledFrom(storedShortcutsValue(false))).toBe(false);
  });
});
