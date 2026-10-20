import { describe, expect, it } from "vitest";

import {
  EMAIL_INPUT_MAX_LENGTH,
  INVITE_LIMIT,
  invitationMessages,
  inviteInput,
  updateWorkspaceNameInput,
  WORKSPACE_NAME_MAX,
  workspaceSettingsMessages,
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

describe("updateWorkspaceNameInput (WS-05, WS-53 … WS-55, criterio 3)", () => {
  function parsed(input: unknown) {
    return updateWorkspaceNameInput.safeParse(input);
  }

  function nameMessage(input: unknown): string | undefined {
    const result = parsed(input);
    return result.success ? undefined : result.error.issues.at(0)?.message;
  }

  it("recorta los espacios de alrededor (WS-04)", () => {
    expect(parsed({ name: "  Estudio Norte  " })).toEqual({
      success: true,
      data: { name: "Estudio Norte" },
    });
  });

  it.each([
    ["vacío", { name: "" }],
    ["solo espacios", { name: " \t\n " }],
    ["un número", { name: 42 }],
    ["un objeto sin name", {}],
    ["algo que no es un objeto", null],
  ])("%s responde nameRequired (WS-53)", (_case, input) => {
    expect(nameMessage(input)).toBe(workspaceSettingsMessages.nameRequired);
  });

  it(`con ${WORKSPACE_NAME_MAX + 1} caracteres después de recortar responde nameTooLong (WS-54)`, () => {
    expect(nameMessage({ name: ` ${"a".repeat(WORKSPACE_NAME_MAX + 1)} ` })).toBe(
      workspaceSettingsMessages.nameTooLong,
    );
  });

  it(`${WORKSPACE_NAME_MAX} caracteres con espacios alrededor pasan (WS-71)`, () => {
    const name = "a".repeat(WORKSPACE_NAME_MAX);

    expect(parsed({ name: `  ${name}  ` })).toEqual({ success: true, data: { name } });
  });

  it("con el carácter nulo responde nameNullCharacter (WS-55)", () => {
    expect(nameMessage({ name: "Estudio\u0000Norte" })).toBe(
      workspaceSettingsMessages.nameNullCharacter,
    );
  });
});
