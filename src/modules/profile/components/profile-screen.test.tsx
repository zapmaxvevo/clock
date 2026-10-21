import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProfileActions } from "@/modules/profile/schema";
import type { ProfileView } from "@/modules/profile/service";

import { ProfileScreen } from "./profile-screen";

/** Dobles escritos a mano: el marcado inicial no llama a las actions. */
const actions: ProfileActions = {
  updatePreference: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  updateName: () => Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
};

const view: ProfileView = {
  identity: {
    name: "Ana Pérez",
    email: "ana@empresa.com",
    image: null,
    initials: "AP",
  },
  // El valor de omisión no es el texto de ninguna opción: la elegida es
  // `timezoneOption`.
  preferences: {
    timezone: "America/Argentina/Buenos_Aires",
    timeFormat: "24h",
    dateFormat: "dd/MM/yyyy",
    theme: "system",
  },
  timezoneOption: "America/Buenos_Aires",
  weekStart: 1,
  durationFormat: "compact",
  canEdit: true,
  options: {
    timezones: [
      { value: "America/Buenos_Aires", example: "UTC−03:00" },
      { value: "Asia/Tokyo", example: "UTC+09:00" },
    ],
    timeFormats: [
      { value: "24h", example: "13:00" },
      { value: "12h", example: "1:00 PM" },
    ],
    dateFormats: [
      { value: "dd/MM/yyyy", example: "04/10/2026" },
      { value: "dd-MM-yyyy", example: "04-10-2026" },
      { value: "yyyy-MM-dd", example: "2026-10-04" },
      { value: "MM/dd/yyyy", example: "10/04/2026" },
    ],
    themes: ["system", "light", "dark"],
  },
};

function render(overrides: Partial<ProfileView> = {}): string {
  return renderToStaticMarkup(
    <ProfileScreen view={{ ...view, ...overrides }} actions={actions} />,
  );
}

/** El texto visible, sin etiquetas. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

/** La sección de la identidad, sin las preferencias. */
function identityOf(markup: string): string {
  return (
    markup.match(/<section aria-labelledby="profile-identity".*?<\/section>/)?.[0] ?? ""
  );
}

/** El grupo «Hora y fecha», sin el de «Apariencia» que le sigue. */
function timeAndDateOf(markup: string): string {
  return markup.split('aria-labelledby="profile-appearance"')[0];
}

/** El grupo «Apariencia». */
function appearanceOf(markup: string): string {
  return markup.split('aria-labelledby="profile-appearance"')[1] ?? "";
}

/** El campo del nombre: el único `input` de la identidad. */
function nameInputOf(markup: string): string {
  return identityOf(markup).match(/<input[^>]*>/)?.[0] ?? "";
}

/** Un atributo `disabled` o `aria-disabled`, no las clases que los nombran. */
const disabledAttribute = /\s(aria-)?disabled(=|\s|>)/;

/** Los disparadores con rol `combobox`: el de la zona, los de los dos formatos y el del tema. */
function comboboxesOf(markup: string): string[] {
  return markup.match(/<button[^>]*role="combobox"[^>]*>.*?<\/button>/g) ?? [];
}

/** El disparador de la zona es el único que abre un diálogo con el buscador. */
function timezoneTriggerOf(markup: string): string | undefined {
  return comboboxesOf(markup).find((trigger) =>
    trigger.includes('aria-haspopup="dialog"'),
  );
}

/** Los `Select`, que abren una lista: los dos formatos y el tema. */
function formatTriggersOf(markup: string): string[] {
  return comboboxesOf(markup).filter(
    (trigger) => !trigger.includes('aria-haspopup="dialog"'),
  );
}

/** El `id` que nombra cada `<label for>`, para encontrar su control. */
function controlIdFor(markup: string, label: string): string | undefined {
  return markup.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`))?.[1];
}

describe("ProfileScreen", () => {
  it("muestra la identidad con el nombre como único control, las iniciales sin foto y la nota de Google", () => {
    const identity = identityOf(render());
    const text = textOf(identity);

    expect(nameInputOf(render())).toContain('value="Ana Pérez"');
    expect(text).toContain("ana@empresa.com");
    expect(text).toContain("AP");
    expect(text).toContain("La foto y el correo salen de tu cuenta de Google.");
    expect(identity.match(/<(input|button|textarea)/g)).toEqual(["<input"]);
  });

  it("el nombre es un campo de texto rotulado «Nombre», que corta en el largo del esquema", () => {
    const markup = render();
    const input = nameInputOf(markup);

    expect(input).toContain('type="text"');
    expect(input).toContain(`id="${controlIdFor(markup, "Nombre")}"`);
    expect(input).toMatch(/\smaxLength="100"/i);
    expect(input).toMatch(/\sautoComplete="name"/i);
    expect(input).not.toMatch(/\sreadonly/i);
  });

  it("sin permiso, el nombre se ve en el campo, readOnly y sin disabled", () => {
    const input = nameInputOf(render({ canEdit: false }));

    expect(input).toContain('value="Ana Pérez"');
    expect(input).toMatch(/\sreadonly(=|\s|>)/i);
    expect(input).not.toMatch(disabledAttribute);
  });

  it("con permiso, la zona es un combobox con la opción equivalente y su desplazamiento", () => {
    const markup = render();
    const trigger = timezoneTriggerOf(markup) ?? "";

    expect(textOf(trigger)).toBe("America/Buenos_AiresUTC−03:00");
    expect(trigger).not.toContain("America/Argentina/Buenos_Aires");
    expect(trigger).toContain(`id="${controlIdFor(markup, "Zona horaria")}"`);
  });

  it("cada formato muestra el valor guardado con su ejemplo, nombrado por su rótulo", () => {
    const markup = render({
      preferences: { ...view.preferences, timeFormat: "12h", dateFormat: "yyyy-MM-dd" },
    });
    const [dateTrigger, timeTrigger] = formatTriggersOf(markup);

    expect(textOf(dateTrigger)).toBe("yyyy-MM-dd (2026-10-04)");
    expect(dateTrigger).toContain(`id="${controlIdFor(markup, "Formato de fecha")}"`);
    expect(textOf(timeTrigger)).toBe("12 horas (1:00 PM)");
    expect(timeTrigger).toContain(`id="${controlIdFor(markup, "Formato de hora")}"`);
  });

  it("muestra el primer día de la semana y el formato de duración con sus notas, sin control", () => {
    const text = textOf(render({ weekStart: 0 }));

    expect(text).toContain("Primer día de la semanaDomingoLo administra el equipo.");
    expect(text).toContain("Formato de duraciónCompacto (h:mm)Lo define el workspace.");
    expect(comboboxesOf(timeAndDateOf(render()))).toHaveLength(3);
  });

  it("PF-31: el formato de duración es el del workspace, con el mismo texto que su selector", () => {
    const text = textOf(render({ durationFormat: "full" }));

    expect(text).toContain(
      "Formato de duraciónCompleto (hh:mm:ss)Lo define el workspace.",
    );
    expect(text).not.toContain("Compacto");
  });

  it("con permiso no muestra el aviso de la membresía y ningún control está inactivo", () => {
    const markup = render();

    expect(markup).not.toContain("Tu acceso al workspace está desactivado.");
    expect(markup).not.toMatch(disabledAttribute);
  });

  it("sin permiso, el aviso de PF-46 y la zona como ajuste fijo, sin combobox", () => {
    const markup = render({ canEdit: false });
    const text = textOf(markup);

    expect(text).toContain("Tu acceso al workspace está desactivado.");
    expect(text).toContain(
      "Podés ver tu perfil, pero no cambiarlo. Pedile a quien administra el workspace que vuelva a activar tu membresía.",
    );
    expect(timezoneTriggerOf(markup)).toBeUndefined();
    expect(controlIdFor(markup, "Zona horaria")).toBeUndefined();
    const zone = markup.match(/<dt[^>]*>Zona horaria<\/dt><dd[^>]*>.*?<\/dd>/)?.[0] ?? "";
    expect(textOf(zone)).toBe("Zona horariaAmerica/Buenos_AiresUTC−03:00");
  });

  it("sin permiso, los dos formatos siguen montados con aria-disabled y sin disabled", () => {
    const markup = render({ canEdit: false });
    const formats = formatTriggersOf(timeAndDateOf(markup));

    expect(formats).toHaveLength(2);
    for (const trigger of formats) {
      expect(trigger).toContain('aria-disabled="true"');
      expect(trigger).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(trigger).toMatch(disabledAttribute);
      expect(trigger).not.toContain("data-disabled");
    }
    expect(textOf(formats[0])).toBe("dd/MM/yyyy (04/10/2026)");
    expect(textOf(formats[1])).toBe("24 horas (13:00)");
  });

  it("el tema, en el grupo «Apariencia», muestra el guardado sin ejemplo, nombrado por su rótulo", () => {
    const markup = render({ preferences: { ...view.preferences, theme: "dark" } });
    const appearance = appearanceOf(markup);
    const [trigger] = formatTriggersOf(appearance);

    expect(textOf(appearance)).toContain("Apariencia");
    expect(formatTriggersOf(appearance)).toHaveLength(1);
    expect(textOf(trigger)).toBe("Oscuro");
    expect(trigger).toContain(`id="${controlIdFor(markup, "Tema")}"`);
  });

  it("sin elegir, el tema es «Seguir al sistema»", () => {
    const [trigger] = formatTriggersOf(appearanceOf(render()));

    expect(textOf(trigger)).toBe("Seguir al sistema");
  });

  it("sin permiso, el tema sigue montado con aria-disabled y sin disabled", () => {
    const [trigger] = formatTriggersOf(appearanceOf(render({ canEdit: false })));

    expect(trigger).toContain('aria-disabled="true"');
    expect(trigger).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(trigger).not.toContain("data-disabled");
  });
});
