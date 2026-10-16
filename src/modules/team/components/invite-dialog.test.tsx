import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import type { ActionFailure } from "@/hooks/use-action";
import {
  invitationMessages,
  type InvitationErrorCode,
  type InviteOutcome,
} from "@/modules/workspace/schema";
import { buttonsOf, textOf } from "@/test/markup";

import { InviteForm, InviteResult } from "./invite-dialog";

function renderForm(
  fields: {
    readonly text?: string;
    readonly fieldError?: string | null;
    readonly failure?: ActionFailure<InvitationErrorCode> | null;
    readonly pending?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <Dialog open>
      <InviteForm
        text={fields.text ?? ""}
        onTextChange={() => undefined}
        fieldError={fields.fieldError ?? null}
        failure={fields.failure ?? null}
        pending={fields.pending ?? false}
        onSubmit={() => undefined}
        onDropRejected={() => undefined}
        onRetry={() => undefined}
      />
    </Dialog>,
  );
}

const rejected: ActionFailure<InvitationErrorCode> = {
  code: "rejected",
  message: "No se invitó a nadie.",
  rejections: [
    {
      id: "no-es-correo",
      code: "invalid_email",
      message: "no-es-correo no es un correo válido.",
    },
    {
      id: "carla@empresa.com",
      code: "inactive_member",
      message: "carla@empresa.com está desactivada: reactivala desde la lista.",
    },
  ],
};

describe("InviteForm", () => {
  it("el título, el campo rotulado con su ayuda, «Cancelar» e «Invitar», sin avisos", () => {
    const markup = renderForm();
    const text = textOf(markup);

    expect(text).toContain("Invitar personas");
    expect(markup).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Correos<\/label>/);
    const fieldId = /<label[^>]*for="([^"]+)"/.exec(markup)?.[1] ?? "";
    expect(markup).toMatch(new RegExp(`<textarea[^>]*id="${fieldId}"`));
    expect(text).toContain(
      "Uno o más, separados por comas, espacios o saltos de línea. Hasta 50 por vez.",
    );
    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar", "Invitar"]);
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toMatch(/\saria-invalid=/);
  });

  it("la ayuda describe el campo", () => {
    const markup = renderForm();
    const describedBy =
      /<textarea[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "";

    expect(markup).toMatch(new RegExp(`<p id="${describedBy}"[^>]*>Uno o más`));
  });

  it("con EQ-77 sin mandar, el mensaje debajo del campo, que lo describe y queda inválido", () => {
    const markup = renderForm({ fieldError: "Escribí al menos un correo." });
    const describedBy =
      /<textarea[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "";
    const errorId = describedBy.split(" ")[1] ?? "";

    expect(markup).toMatch(/<textarea[^>]*aria-invalid="true"/);
    expect(markup).toMatch(
      new RegExp(
        `<p id="${errorId}" role="alert"[^>]*>Escribí al menos un correo\\.</p>`,
      ),
    );
    expect(markup.indexOf("Escribí al menos")).toBeGreaterThan(
      markup.indexOf("<textarea"),
    );
  });

  it("con `rejected`, arriba «No se invitó a nadie.», cada causa y «Quitar los que fallan»", () => {
    const markup = renderForm({
      text: "no-es-correo carla@empresa.com ana@empresa.com",
      failure: rejected,
    });
    const alert = markup.slice(
      markup.indexOf('role="alert"'),
      markup.indexOf("<textarea"),
    );
    const items = (alert.match(/<li>(.*?)<\/li>/g) ?? []).map(textOf);

    expect(textOf(alert)).toContain("No se invitó a nadie.");
    expect(items).toEqual([
      "no-es-correo no es un correo válido.",
      "carla@empresa.com está desactivada: reactivala desde la lista.",
    ]);
    expect(buttonsOf(alert).map(textOf)).toEqual(["Quitar los que fallan"]);
    expect(textOf(alert)).not.toContain("Reintentar");
  });

  it("lo escrito queda en el campo después del rechazo", () => {
    const markup = renderForm({
      text: "no-es-correo ana@empresa.com",
      failure: rejected,
    });

    expect(markup).toMatch(/<textarea[^>]*>no-es-correo ana@empresa\.com<\/textarea>/);
  });

  it("con `unexpected`, el aviso con «Reintentar»", () => {
    const markup = renderForm({
      failure: {
        code: "unexpected",
        message:
          "No se pudieron mandar las invitaciones. Revisá la conexión y volvé a intentar.",
      },
    });
    const alert = markup.slice(
      markup.indexOf('role="alert"'),
      markup.indexOf("<textarea"),
    );

    expect(textOf(alert)).toContain("No se pudieron mandar las invitaciones.");
    expect(buttonsOf(alert).map(textOf)).toEqual(["Reintentar"]);
  });

  it.each([
    invitationMessages.noEmails,
    invitationMessages.tooMany,
    invitationMessages.inputTooLong,
  ])(
    "con `validation` del servidor, «%s» arriba, sin «Reintentar» ni lista",
    (message) => {
      const markup = renderForm({ failure: { code: "validation", message } });
      const alert = markup.slice(
        markup.indexOf('role="alert"'),
        markup.indexOf("<textarea"),
      );

      expect(textOf(alert)).toContain(message);
      expect(textOf(markup)).not.toContain("Reintentar");
      expect(markup).not.toContain("<li>");
    },
  );

  it("con el pedido en vuelo, «Invitando…» y los botones con aria-disabled, sin disabled", () => {
    const buttons = buttonsOf(renderForm({ pending: true }));

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Invitando…"]);
    for (const button of buttons) {
      expect(button).toContain('aria-disabled="true"');
      expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });
});

const outcomes: readonly InviteOutcome[] = [
  { email: "ana@empresa.com", result: "invited", external: false },
  { email: "nico@otro.com", result: "invited", external: true },
  { email: "bruno@empresa.com", result: "already_invited", external: false },
  { email: "olga@empresa.com", result: "already_member", external: false },
];

function renderResult(): string {
  return renderToStaticMarkup(
    <Dialog open>
      <InviteResult outcomes={outcomes} appUrl="https://clock.empresa.com" />
    </Dialog>,
  );
}

/** El ítem de la lista de resultados que empieza con `email`. */
function itemOf(markup: string, email: string): string {
  const items = markup.match(/<li[^>]*>.*?<\/li>/g) ?? [];
  return items.find((item) => textOf(item).startsWith(email)) ?? "";
}

describe("InviteResult", () => {
  it("el título «Invitaciones» y la explicación de que Clock no manda correos", () => {
    const text = textOf(renderResult());

    expect(text).toContain("Invitaciones");
    expect(text).toContain(
      "Clock no manda correos: avisale a cada persona con este texto.",
    );
  });

  it("una fila por correo, en el orden recibido, con su resultado", () => {
    const markup = renderResult();
    const items = markup.match(/<li[^>]*>.*?<\/li>/g) ?? [];

    expect(items).toHaveLength(4);
    expect(textOf(itemOf(markup, "ana@empresa.com"))).toContain("Invitada");
    expect(textOf(itemOf(markup, "bruno@empresa.com"))).toContain("Ya estaba invitada");
    expect(textOf(itemOf(markup, "olga@empresa.com"))).toContain("Ya está en el equipo");
    expect(items.map((item) => textOf(item).split(/(Externa|Invitada|Ya )/)[0])).toEqual([
      "ana@empresa.com",
      "nico@otro.com",
      "bruno@empresa.com",
      "olga@empresa.com",
    ]);
  });

  it("D-E1a-10: el aviso y «Copiar» en las invitadas y en las que ya estaban invitadas", () => {
    const markup = renderResult();

    for (const email of ["ana@empresa.com", "nico@otro.com", "bruno@empresa.com"]) {
      const item = itemOf(markup, email);
      expect(textOf(item)).toContain(
        `Entrá a https://clock.empresa.com con tu cuenta de Google ${email}.`,
      );
      const [copy] = buttonsOf(item);
      expect(textOf(copy ?? "")).toBe("Copiar");
      expect(copy).toContain(`aria-label="Copiar aviso para ${email}"`);
    }
  });

  it("sin aviso ni «Copiar» para quien ya está en el equipo", () => {
    const item = itemOf(renderResult(), "olga@empresa.com");

    expect(textOf(item)).not.toContain("Entrá a");
    expect(buttonsOf(item)).toEqual([]);
  });

  it("la marca «Externa» solo en el correo de otro dominio", () => {
    const markup = renderResult();

    expect(textOf(itemOf(markup, "nico@otro.com"))).toContain("Externa");
    expect(textOf(itemOf(markup, "ana@empresa.com"))).not.toContain("Externa");
  });

  it("una región de estado para anunciar la copia, y «Listo»", () => {
    const markup = renderResult();

    expect(markup).toMatch(/<p role="status"[^>]*><\/p>/);
    expect(buttonsOf(markup).map(textOf).at(-1)).toBe("Listo");
  });
});
