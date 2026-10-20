import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GrantView } from "@/modules/mcp/schema";
import { buttonsOf, textOf } from "@/test/markup";

import {
  AssistantGrants,
  AssistantGrantsView,
  type CopyState,
  type GrantsFeedback,
} from "./assistant-grants";

const SERVER_URL = "https://clock.empresa.com/api/mcp";

/** Un cliente remoto y uno de loopback. */
const grants: readonly GrantView[] = [
  {
    clientId: "cliente-remoto",
    name: "Asistente web",
    returnsTo: "asistente.example",
    grantedOn: "12/10/2026",
  },
  {
    clientId: "cliente-local",
    name: "Asistente local",
    returnsTo: "esta computadora",
    grantedOn: "15/10/2026",
  },
];

function render(
  options: {
    readonly rows?: readonly GrantView[];
    readonly canRevoke?: boolean;
    readonly pending?: boolean;
    readonly feedback?: GrantsFeedback | null;
    readonly copy?: CopyState;
  } = {},
): string {
  return renderToStaticMarkup(
    <AssistantGrantsView
      serverUrl={SERVER_URL}
      grants={options.rows ?? grants}
      canRevoke={options.canRevoke ?? true}
      pending={options.pending ?? false}
      feedback={options.feedback ?? null}
      copy={options.copy ?? "idle"}
      onCopy={() => undefined}
      onRevoke={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

/** Los ítems de la lista, sin etiquetas. */
function itemsOf(markup: string): string[] {
  return [...markup.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(([, item]) => item);
}

/** La región `status` de «Copiar». */
function copyStatusOf(markup: string): string {
  return markup.match(/<p role="status"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
}

describe("AssistantGrantsView", () => {
  it("§5.3: la sección se nombra por su `h2`, que recibe el foco, con el texto de lo que pueden", () => {
    const markup = render();

    expect(markup).toMatch(/<section aria-labelledby="asistentes-conectados"/);
    expect(markup).toMatch(
      /<h2 id="asistentes-conectados" tabindex="-1"[^>]*>Asistentes conectados<\/h2>/,
    );
    expect(textOf(markup)).toContain(
      "Los asistentes que conectaste pueden ver y editar tus horas con tu cuenta. Cerrar la sesión no los desconecta.",
    );
  });

  it("la dirección para conectar, en un campo de solo lectura con su rótulo y «Copiar»", () => {
    const markup = render();
    const input = markup.match(/<input[^>]*>/)?.[0] ?? "";
    const id = input.match(/id="([^"]+)"/)?.[1];

    expect(input).toContain(`value="${SERVER_URL}"`);
    expect(input).toMatch(/\sreadonly/i);
    expect(markup).toMatch(new RegExp(`<label data-slot="label"[^>]*for="${id}"`));
    expect(textOf(markup)).toContain("Dirección para conectar");
    expect(buttonsOf(markup).map(textOf)).toContain("Copiar");
  });

  it("la región `status` existe vacía antes de copiar, para que el anuncio se oiga", () => {
    expect(copyStatusOf(render())).toBe("");
  });

  it("al copiar, el botón dice «Copiada» y la región lo anuncia", () => {
    const markup = render({ copy: "copied" });

    expect(buttonsOf(markup).map(textOf)).toContain("Copiada");
    expect(copyStatusOf(markup)).toBe("Dirección copiada.");
  });

  it("si no se pudo copiar, la región lo dice y el botón sigue en «Copiar»", () => {
    const markup = render({ copy: "failed" });

    expect(buttonsOf(markup).map(textOf)).toContain("Copiar");
    expect(copyStatusOf(markup)).toBe(
      "No se pudo copiar. Seleccioná la dirección y copiala a mano.",
    );
  });

  it("una fila por cliente: el nombre en negrita y, en gris, adónde vuelve y desde cuándo", () => {
    const items = itemsOf(render());

    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/<span class="font-semibold[^"]*">Asistente web<\/span>/);
    expect(items[0]).toMatch(
      /<span class="text-muted-foreground[^"]*">Vuelve a asistente\.example · Conectado el 12\/10\/2026<\/span>/,
    );
    expect(textOf(items[1])).toContain(
      "Vuelve a esta computadora · Conectado el 15/10/2026",
    );
  });

  it("«Desconectar» de cada fila nombra al asistente y lleva el id adonde vuelve el foco", () => {
    const buttons = itemsOf(render()).map((item) => buttonsOf(item)[0] ?? "");

    expect(buttons.map(textOf)).toEqual(["Desconectar", "Desconectar"]);
    expect(buttons[0]).toContain('aria-label="Desconectar: Asistente web"');
    expect(buttons[0]).toContain('id="desconectar-cliente-remoto"');
    expect(buttons[1]).toContain('aria-label="Desconectar: Asistente local"');
    expect(buttons[0]).not.toContain('aria-disabled="true"');
  });

  it("un pedido a la vez: con uno en curso, cada «Desconectar» en `aria-disabled`, no `disabled`", () => {
    const buttons = itemsOf(render({ pending: true })).map(
      (item) => buttonsOf(item)[0] ?? "",
    );

    for (const button of buttons) {
      expect(button).toContain('aria-disabled="true"');
      expect(button).not.toMatch(/\sdisabled=""/);
    }
  });

  it("sin `canRevoke`, la lista sin «Desconectar»", () => {
    const items = itemsOf(render({ canRevoke: false }));

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(buttonsOf(item)).toEqual([]);
    }
  });

  it("vacía: el texto en lugar de la lista, con la dirección para conectar", () => {
    const markup = render({ rows: [] });

    expect(markup).not.toContain("<ul");
    expect(textOf(markup)).toContain("No conectaste ningún asistente.");
    expect(markup).toContain(`value="${SERVER_URL}"`);
  });

  it("con éxito, el aviso informativo con `role=status`", () => {
    const markup = render({
      feedback: { tone: "info", title: "Desconectaste Asistente web.", retry: false },
    });

    expect(markup).toMatch(/role="status"[^>]*>.*Desconectaste Asistente web\./);
    expect(markup).not.toContain('role="alert"');
  });

  it("con error, el mensaje de la action en `role=alert` y, con `unexpected`, «Reintentar»", () => {
    const markup = render({
      feedback: {
        tone: "error",
        title: "No se pudo desconectar Asistente web.",
        message: "No se pudo desconectar. Revisá la conexión y volvé a intentar.",
        retry: true,
      },
    });
    const alert = markup.match(/<div[^>]*role="alert".*?Reintentar<\/button>/)?.[0] ?? "";

    expect(textOf(alert)).toContain("No se pudo desconectar Asistente web.");
    expect(textOf(alert)).toContain(
      "No se pudo desconectar. Revisá la conexión y volvé a intentar.",
    );
  });

  it("un error que no es `unexpected` no ofrece «Reintentar»", () => {
    const markup = render({
      feedback: {
        tone: "error",
        title: "No se pudo desconectar Asistente web.",
        message: "No tenés permiso para hacer esto.",
        retry: false,
      },
    });

    expect(markup).toContain('role="alert"');
    expect(buttonsOf(markup).map(textOf)).not.toContain("Reintentar");
  });
});

describe("AssistantGrants", () => {
  it("dibuja la vista del servidor, sin aviso ni pedido en curso", () => {
    const markup = renderToStaticMarkup(
      <AssistantGrants
        view={{ serverUrl: SERVER_URL, grants, canRevoke: true }}
        revokeGrant={() =>
          Promise.resolve({ ok: false, code: "unexpected", message: "doble" })
        }
      />,
    );

    expect(itemsOf(markup)).toHaveLength(2);
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).not.toContain('role="alert"');
  });
});
