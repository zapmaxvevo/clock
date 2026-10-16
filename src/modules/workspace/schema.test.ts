import { describe, expect, it } from "vitest";

import {
  EMAIL_INPUT_MAX_LENGTH,
  INVITE_LIMIT,
  invitationMessages,
  inviteInput,
} from "./schema";

/** El primer mensaje del pedido rechazado, que es el que muestra la action. */
function firstMessage(input: unknown): string | undefined {
  const parsed = inviteInput.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues.at(0)?.message;
}

describe("inviteInput (D-E1a-6)", () => {
  it("acepta correos crudos, con blancos y mal escritos: los clasifica el service", () => {
    expect(firstMessage({ emails: [" Ana@Gmail.com ", "no-es-correo", " "] })).toBe(
      undefined,
    );
  });

  it.each([
    ["ningún correo", []],
    ["solo blancos", [" ", "\n\t"]],
    ["una cadena vacía", [""]],
  ])("con %s responde noEmails (EQ-77)", (_case, emails) => {
    expect(firstMessage({ emails })).toBe(invitationMessages.noEmails);
  });

  it(`con ${INVITE_LIMIT + 1} correos responde tooMany (EQ-78)`, () => {
    const emails = Array.from(
      { length: INVITE_LIMIT + 1 },
      (_, index) => `p${index}@x.com`,
    );

    expect(firstMessage({ emails })).toBe(invitationMessages.tooMany);
    expect(firstMessage({ emails: emails.slice(1) })).toBe(undefined);
  });

  it(`con un texto de más de ${EMAIL_INPUT_MAX_LENGTH} caracteres responde inputTooLong`, () => {
    const atLimit = "a".repeat(EMAIL_INPUT_MAX_LENGTH);

    expect(firstMessage({ emails: [atLimit] })).toBe(undefined);
    expect(firstMessage({ emails: ["ana@gmail.com", `${atLimit}a`] })).toBe(
      invitationMessages.inputTooLong,
    );
  });

  it("con algo que no es una lista de textos responde noEmails", () => {
    expect(firstMessage({ emails: "ana@gmail.com" })).toBe(invitationMessages.noEmails);
    expect(firstMessage({ emails: [42] })).toBe(invitationMessages.noEmails);
    expect(firstMessage(null)).toBe(invitationMessages.noEmails);
  });
});
