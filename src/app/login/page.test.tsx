import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { textOf } from "@/test/markup";

import LoginPage from "./page";

// Sin sesión salvo que el caso la abra. La sesión real carga la base y Better Auth.
const session = vi.hoisted(() => ({ current: null as object | null }));
vi.mock("@/server/session", () => ({
  currentSession: () => Promise.resolve(session.current),
}));

// Como el de Next, `redirect` corta el render: lanza con el destino.
const redirect = vi.hoisted(() =>
  vi.fn((to: string): never => {
    throw new Error(`redirect:${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

afterEach(() => {
  session.current = null;
  redirect.mockClear();
});

type Query = Record<string, string | string[]>;

async function renderQuery(query: Query): Promise<string> {
  return renderToStaticMarkup(
    await LoginPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(query),
    }),
  );
}

async function render(error?: string | string[]): Promise<string> {
  return renderQuery(error === undefined ? {} : { error });
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

describe("LoginPage con la sesión abierta (criterio 18)", () => {
  /** La consulta firmada que manda el servidor de autorización con `prompt=login`. */
  const oauthQuery: Query = {
    response_type: "code",
    client_id: "cliente-de-prueba",
    redirect_uri: "http://127.0.0.1:33418/callback",
    scope: "openid offline_access",
    prompt: "login",
    exp: "1792540800",
    sig: "firma-de-prueba",
  };

  it("sin consulta, redirige a /", async () => {
    session.current = { user: { id: "u-1" } };

    await expect(render()).rejects.toThrow("redirect:/");
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("con solo `error`, redirige a /", async () => {
    session.current = { user: { id: "u-1" } };

    await expect(render("dominio_no_habilitado")).rejects.toThrow("redirect:/");
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("con la consulta firmada, muestra el botón y no redirige", async () => {
    session.current = { user: { id: "u-1" } };

    const markup = await renderQuery(oauthQuery);

    expect(redirect).not.toHaveBeenCalled();
    expect(textOf(markup)).toContain("Entrar con Google");
  });
});
