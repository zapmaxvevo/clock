import { describe, expect, it } from "vitest";

import {
  confirmTarget,
  editorCancelTarget,
  editorCloseTarget,
  type FocusPlaces,
} from "./cell-detail-focus";

const a = "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3";
const entry = { id: a };

/** Cada lugar como un nombre; los que se pasan en `missing` ya no están. */
function places(...missing: string[]): FocusPlaces<string> {
  const present = (name: string) => (missing.includes(name) ? null : name);
  return {
    trigger: () => present("disparador"),
    destination: () => present("campo"),
    title: () => present("título"),
    button: (entryId, button) => present(`${button}:${entryId}`),
  };
}

describe("cell-detail-focus: adónde va el foco al cerrarse un diálogo del detalle (§5.6)", () => {
  it("cancelar lo abierto desde el menú vuelve al disparador; sin él, al destino de la celda", () => {
    expect(
      editorCancelTarget({ entry, origin: "menu", closedBy: null }, places("disparador")),
    ).toBe("campo");
    expect(editorCancelTarget({ entry, origin: "menu", closedBy: null }, places())).toBe(
      "disparador",
    );
    expect(confirmTarget({ entry, origin: "menu", confirmed: false }, places())).toBe(
      "disparador",
    );
  });

  it("cancelar el editor abierto desde la lista vuelve a su «Editar»; si la entrada salió, al título", () => {
    const editor = { entry, origin: "list", closedBy: null } as const;

    expect(editorCancelTarget(editor, places())).toBe(`edit:${a}`);
    expect(editorCancelTarget(editor, places(`edit:${a}`))).toBe("título");
  });

  it("cancelar la confirmación vuelve al botón de la lista que abrió la cadena", () => {
    expect(
      confirmTarget(
        { entry, origin: "list", returnTo: "delete", confirmed: false },
        places(),
      ),
    ).toBe(`delete:${a}`);
    expect(
      confirmTarget(
        { entry, origin: "list", returnTo: "edit", confirmed: false },
        places(),
      ),
    ).toBe(`edit:${a}`);
    expect(
      confirmTarget(
        { entry, origin: "list", returnTo: "delete", confirmed: false },
        places(`delete:${a}`),
      ),
    ).toBe("título");
  });

  it("el editor del menú que se asienta o falla con `CLOSING_CODES` va al destino de la celda", () => {
    expect(
      editorCloseTarget({ entry, origin: "menu", closedBy: "saved" }, places()),
    ).toBe("campo");
    expect(
      editorCloseTarget({ entry, origin: "menu", closedBy: "failed" }, places()),
    ).toBe("campo");
  });

  it("el editor de la lista que se asienta vuelve a su «Editar»; el que falla, al título", () => {
    expect(
      editorCloseTarget({ entry, origin: "list", closedBy: "saved" }, places()),
    ).toBe(`edit:${a}`);
    expect(
      editorCloseTarget({ entry, origin: "list", closedBy: "failed" }, places()),
    ).toBe("título");
  });

  it("«Borrar» del menú del editor no mueve el foco: lo toma la confirmación", () => {
    expect(
      editorCloseTarget({ entry, origin: "menu", closedBy: "delete" }, places()),
    ).toBeNull();
    expect(
      editorCloseTarget({ entry, origin: "list", closedBy: "delete" }, places()),
    ).toBeNull();
  });

  it("confirmar desde el menú va al destino de la celda; desde la lista, al título", () => {
    expect(confirmTarget({ entry, origin: "menu", confirmed: true }, places())).toBe(
      "campo",
    );
    expect(
      confirmTarget(
        { entry, origin: "list", returnTo: "delete", confirmed: true },
        places(),
      ),
    ).toBe("título");
  });
});
