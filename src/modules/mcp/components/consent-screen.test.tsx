import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ConsentView } from "@/modules/mcp/schema";
import { buttonsOf, textOf } from "@/test/markup";

import { ConsentCard, ConsentScreen, type ConsentFailure } from "./consent-screen";

const ready: ConsentView = {
  kind: "ready",
  oauthQuery: "client_id=abc&sig=firma",
  clientName: "Asistente de prueba",
  returnsTo: "asistente.example",
  email: "ana@empresa.com",
  seesTeam: false,
};

function render(
  view: ConsentView,
  options: {
    readonly busy?: boolean;
    readonly accepting?: boolean;
    readonly failure?: ConsentFailure | null;
  } = {},
): string {
  return renderToStaticMarkup(
    <ConsentCard
      view={view}
      busy={options.busy ?? false}
      accepting={options.accepting ?? true}
      failure={options.failure ?? null}
      onChoose={() => undefined}
    />,
  );
}

/** El título de la pantalla, sin etiquetas. */
function headingOf(markup: string): string {
  return textOf(markup.match(/<h1[^>]*>.*?<\/h1>/)?.[0] ?? "");
}

describe("ConsentCard", () => {
  it("§5.1 `ready`: quién pide, qué puede hacer, con qué cuenta y adónde vuelve", () => {
    const markup = render(ready);
    const text = textOf(markup);

    expect(headingOf(markup)).toBe("Conectar Asistente de prueba con Clock");
    expect(text).toContain(
      "Asistente de prueba va a poder ver, cargar, editar y borrar tus horas, y leer tus proyectos, tareas y etiquetas, con tu cuenta (ana@empresa.com).",
    );
    expect(markup).toMatch(
      /<p class="text-muted-foreground[^"]*">Vuelve a: asistente\.example<\/p>/,
    );
    expect(text).toContain("Podés desconectarlo cuando quieras desde tu perfil.");
  });

  it("`ready`: «Cancelar» secundario y «Conectar» primario, sin `aria-disabled`", () => {
    const buttons = buttonsOf(render(ready));

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Conectar"]);
    expect(buttons[0]).toContain("border-border");
    expect(buttons[1]).toContain("bg-primary");
    for (const button of buttons) {
      expect(button).not.toContain('aria-disabled="true"');
    }
  });

  it("«Vuelve a: esta computadora» para una redirección de loopback", () => {
    const markup = render({ ...ready, returnsTo: "esta computadora" });

    expect(textOf(markup)).toContain("Vuelve a: esta computadora");
  });

  it("al elegir «Conectar»: los dos en `aria-disabled`, no `disabled`, y «Conectando…» en el primario", () => {
    const buttons = buttonsOf(render(ready, { busy: true, accepting: true }));

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Conectando…"]);
    for (const button of buttons) {
      expect(button).toContain('aria-disabled="true"');
      expect(button).not.toMatch(/\sdisabled=""/);
    }
  });

  it("al elegir «Cancelar»: los dos en `aria-disabled` y el primario no dice «Conectando…»", () => {
    const buttons = buttonsOf(render(ready, { busy: true, accepting: false }));

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Conectar"]);
    for (const button of buttons) {
      expect(button).toContain('aria-disabled="true"');
    }
  });

  it("con error, el mensaje de la action en `role=alert` y los botones de nuevo", () => {
    const markup = render(ready, {
      failure: {
        title: "No se pudo conectar.",
        message: "No se pudo completar la conexión. Volvé a intentar desde el asistente.",
      },
    });
    const alert = markup.match(/<div[^>]*role="alert".*?<\/div><\/div>/)?.[0] ?? "";

    expect(textOf(alert)).toContain("No se pudo conectar.");
    expect(textOf(alert)).toContain(
      "No se pudo completar la conexión. Volvé a intentar desde el asistente.",
    );
    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar", "Conectar"]);
  });

  it("`forbidden`: el texto del permiso y solo «Cancelar»", () => {
    const markup = render({ kind: "forbidden", oauthQuery: "client_id=abc&sig=firma" });

    expect(headingOf(markup)).toBe("Conectar un asistente con Clock");
    expect(textOf(markup)).toContain(
      "Tu acceso al workspace no permite conectar asistentes.",
    );
    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar"]);
  });

  it("`invalid`: el texto del pedido vencido, sin botones", () => {
    const markup = render({ kind: "invalid" });

    expect(headingOf(markup)).toBe("Conectar un asistente con Clock");
    expect(textOf(markup)).toContain(
      "El pedido de conexión venció o no es válido. Volvé a conectar desde el asistente.",
    );
    expect(buttonsOf(markup)).toEqual([]);
  });

  it("el título recibe el foco cuando la consulta vence y los botones se van", () => {
    expect(render({ kind: "invalid" })).toMatch(/<h1 tabindex="-1"/);
  });

  it("la caja de `/login`: centrada y angosta, dentro de `main`", () => {
    const markup = render(ready);

    expect(markup).toMatch(/^<main class="flex min-h-dvh items-center justify-center/);
    expect(markup).toContain("max-w-sm");
  });
});

describe("ConsentScreen", () => {
  it("dibuja la vista del servidor, sin aviso ni pedido en curso", () => {
    const markup = renderToStaticMarkup(
      <ConsentScreen
        view={ready}
        decideConsent={() =>
          Promise.resolve({ ok: false, code: "unexpected", message: "doble" })
        }
      />,
    );

    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar", "Conectar"]);
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).not.toContain('role="alert"');
  });
});
