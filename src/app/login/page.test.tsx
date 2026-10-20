import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { textOf } from "@/test/markup";

import LoginPage from "./page";

// Sin sesión: la página muestra el acceso. La sesión real carga la base y Better Auth.
vi.mock("@/server/session", () => ({ currentSession: () => Promise.resolve(null) }));

async function render(error?: string | string[]): Promise<string> {
  const searchParams = Promise.resolve(error === undefined ? {} : { error });
  return renderToStaticMarkup(
    await LoginPage({ params: Promise.resolve({}), searchParams }),
  );
}

/** El aviso de error, desde su apertura hasta el botón. */
function alertOf(markup: string): string {
  const role = markup.indexOf('role="alert"');
  if (role === -1) {
    return "";
  }
  const start = markup.lastIndexOf("<", role);
  return markup.slice(start, markup.indexOf("<button", start));
}

describe("LoginPage", () => {
  it("sin `error`, ningún aviso", async () => {
    const markup = await render();

    expect(markup).not.toContain('role="alert"');
    expect(textOf(markup)).toContain("Entrar con Google");
  });

  it("con un motivo conocido, su texto en un aviso encima del botón", async () => {
    const markup = await render("dominio_no_habilitado");

    expect(textOf(alertOf(markup))).toBe(
      "La cuenta no es la de Google Workspace de la empresa.",
    );
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("<button"));
  });

  it("sin invitación, el texto de EQ-91 en un aviso encima del botón", async () => {
    const markup = await render("sin_invitacion");

    expect(textOf(alertOf(markup))).toBe(
      "Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.",
    );
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("<button"));
    expect(textOf(markup)).toContain("Entrar con Google");
  });

  it("con la membresía inactiva, el texto de EQ-92 en un aviso encima del botón", async () => {
    const markup = await render("membresia_inactiva");

    expect(textOf(alertOf(markup))).toBe(
      "Tu acceso al workspace está desactivado. Pedile a quien administra el equipo que te vuelva a activar.",
    );
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("<button"));
    expect(textOf(markup)).toContain("Entrar con Google");
  });

  it("con account_not_linked, el texto de EQ-122 en un aviso encima del botón (D-E2b-10)", async () => {
    const markup = await render("account_not_linked");

    expect(textOf(alertOf(markup))).toBe(
      "Ya hay una persona en Clock con ese correo. Pedile a quien administra el equipo que revise tu acceso.",
    );
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("<button"));
    expect(textOf(markup)).not.toContain("account_not_linked");
  });

  it("con vinculacion_fallida, el texto genérico y nunca el código (D-E2b-3)", async () => {
    const markup = await render("vinculacion_fallida");

    expect(textOf(alertOf(markup))).toBe("No se pudo iniciar sesión. Volvé a intentar.");
    expect(textOf(markup)).not.toContain("vinculacion_fallida");
  });

  it("con un código que no conoce, el texto genérico", async () => {
    const markup = await render("state_not_found");

    expect(textOf(alertOf(markup))).toBe("No se pudo iniciar sesión. Volvé a intentar.");
  });

  it("con un texto armado a mano, el genérico y nunca el texto del parámetro", async () => {
    const forged = "Tu cuenta fue suspendida. Llamá al 0800-FALSO.";
    const markup = await render(forged);

    expect(textOf(alertOf(markup))).toBe("No se pudo iniciar sesión. Volvé a intentar.");
    expect(textOf(markup)).not.toContain("suspendida");
  });

  it("con el parámetro repetido, decide por el primero", async () => {
    const markup = await render(["email_no_verificado", "Texto armado"]);

    expect(textOf(alertOf(markup))).toBe(
      "El email de la cuenta de Google no está verificado.",
    );
    expect(textOf(markup)).not.toContain("Texto armado");
  });
});
