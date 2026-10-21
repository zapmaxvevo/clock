import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  createClientInput,
  createProjectInput,
  createTagInput,
  createTaskInput,
  projectMessages,
  projectsSearchParams,
  updateProjectInput,
} from "./schema";

const id = "6f1c2a4e-3b5d-4e7f-8a9b-0c1d2e3f4a5b";
const nilUuid = "00000000-0000-0000-0000-000000000000";
const uuidV7 = "01926b8e-7c3a-7d4e-9f00-112233445566";

function messageOf(result: z.ZodSafeParseResult<unknown>): string | undefined {
  return result.success ? undefined : result.error.issues.at(0)?.message;
}

describe("el nombre, en las cuatro altas y la edición (PR-54, PR-75, PR-76, PR-109)", () => {
  const cases = [
    ["cliente", (name: string) => createClientInput.safeParse({ id, name })],
    [
      "proyecto",
      (name: string) =>
        createProjectInput.safeParse({ id, name, clientId: null, color: null }),
    ],
    ["tarea", (name: string) => createTaskInput.safeParse({ id, projectId: id, name })],
    ["etiqueta", (name: string) => createTagInput.safeParse({ id, name })],
    ["edición de proyecto", (name: string) => updateProjectInput.safeParse({ id, name })],
  ] as const;

  for (const [entity, parse] of cases) {
    describe(entity, () => {
      it("recorta los espacios de los extremos", () => {
        const result = parse("  Acme  ");
        expect(result.success && result.data.name).toBe("Acme");
      });

      it("rechaza vacío o solo espacios con PR-75", () => {
        expect(messageOf(parse(""))).toBe(projectMessages.nameRequired);
        expect(messageOf(parse("   "))).toBe(projectMessages.nameRequired);
      });

      it("acepta 100 caracteres y rechaza 101 con PR-76", () => {
        expect(parse("a".repeat(100)).success).toBe(true);
        expect(messageOf(parse("a".repeat(101)))).toBe(projectMessages.nameTooLong);
      });

      it("cuenta el largo después de recortar", () => {
        expect(parse(` ${"a".repeat(100)} `).success).toBe(true);
      });

      it("rechaza el carácter nulo", () => {
        expect(messageOf(parse("Ac\u0000me"))).toBe(projectMessages.nullCharacter);
      });
    });
  }
});

describe("createClientInput", () => {
  it("deja la dirección y la nota en vacío si no llegan", () => {
    expect(createClientInput.parse({ id, name: "Acme" })).toEqual({
      id,
      name: "Acme",
      address: "",
      note: "",
    });
  });

  it("acepta hasta 3000 caracteres de dirección y de nota (PR-54)", () => {
    const long = "a".repeat(3000);
    expect(
      createClientInput.safeParse({ id, name: "Acme", address: long, note: long })
        .success,
    ).toBe(true);
    expect(
      messageOf(createClientInput.safeParse({ id, name: "Acme", address: `${long}a` })),
    ).toBe(projectMessages.addressTooLong);
    expect(
      messageOf(createClientInput.safeParse({ id, name: "Acme", note: `${long}a` })),
    ).toBe(projectMessages.noteTooLong);
  });

  it("recorta la dirección y la nota, y rechaza el carácter nulo en ellas", () => {
    const parsed = createClientInput.parse({
      id,
      name: "Acme",
      address: " Calle 1 ",
      note: " x ",
    });
    expect(parsed.address).toBe("Calle 1");
    expect(parsed.note).toBe("x");
    expect(
      messageOf(createClientInput.safeParse({ id, name: "Acme", note: "\u0000" })),
    ).toBe(projectMessages.nullCharacter);
  });

  it("exige un id UUID v4 (ADR 0007)", () => {
    expect(createClientInput.safeParse({ id: nilUuid, name: "Acme" }).success).toBe(
      false,
    );
    expect(createClientInput.safeParse({ id: uuidV7, name: "Acme" }).success).toBe(false);
    expect(createClientInput.safeParse({ id: "no-es-un-id", name: "Acme" }).success).toBe(
      false,
    );
  });
});

describe("createProjectInput", () => {
  const base = { id, name: "Web", clientId: null, color: null };

  it("acepta sin cliente y sin color", () => {
    expect(createProjectInput.parse(base)).toEqual({
      ...base,
      note: "",
      billableByDefault: false,
    });
  });

  it("PR-21: acepta el facturable por defecto y rechaza lo que no es booleano", () => {
    expect(createProjectInput.parse({ ...base, billableByDefault: true })).toMatchObject({
      billableByDefault: true,
    });
    expect(
      createProjectInput.safeParse({ ...base, billableByDefault: "true" }).success,
    ).toBe(false);
    expect(
      createProjectInput.safeParse({ ...base, billableByDefault: null }).success,
    ).toBe(false);
  });

  it("acepta una clave de la paleta y rechaza otra cosa", () => {
    expect(createProjectInput.safeParse({ ...base, color: "teal" }).success).toBe(true);
    expect(createProjectInput.safeParse({ ...base, color: "#DC2626" }).success).toBe(
      false,
    );
    expect(createProjectInput.safeParse({ ...base, color: "magenta" }).success).toBe(
      false,
    );
  });

  it("exige que cliente y color lleguen, aunque sea como null", () => {
    expect(createProjectInput.safeParse({ id, name: "Web" }).success).toBe(false);
  });

  it("acepta cualquier UUID como cliente y rechaza lo que no lo es", () => {
    expect(createProjectInput.safeParse({ ...base, clientId: uuidV7 }).success).toBe(
      true,
    );
    expect(createProjectInput.safeParse({ ...base, clientId: "acme" }).success).toBe(
      false,
    );
  });

  it("rechaza una nota de más de 3000 caracteres", () => {
    expect(
      messageOf(createProjectInput.safeParse({ ...base, note: "a".repeat(3001) })),
    ).toBe(projectMessages.noteTooLong);
  });

  it("exige un id UUID v4", () => {
    expect(createProjectInput.safeParse({ ...base, id: nilUuid }).success).toBe(false);
  });
});

describe("createTaskInput", () => {
  it("exige el proyecto como UUID y un id v4", () => {
    expect(
      createTaskInput.safeParse({ id, projectId: "web", name: "Diseño" }).success,
    ).toBe(false);
    expect(
      createTaskInput.safeParse({ id: uuidV7, projectId: id, name: "Diseño" }).success,
    ).toBe(false);
    expect(
      createTaskInput.safeParse({ id, projectId: uuidV7, name: "Diseño" }).success,
    ).toBe(true);
  });
});

describe("createTagInput (PR-43)", () => {
  it("es el id y el nombre, nada más", () => {
    expect(createTagInput.parse({ id, name: " Diseño ", color: "red" })).toEqual({
      id,
      name: "Diseño",
    });
  });

  it("exige un id v4, como las otras altas (ADR 0007)", () => {
    expect(createTagInput.safeParse({ id: uuidV7, name: "Diseño" }).success).toBe(false);
    expect(createTagInput.safeParse({ id: nilUuid, name: "Diseño" }).success).toBe(false);
    expect(createTagInput.safeParse({ name: "Diseño" }).success).toBe(false);
  });
});

describe("updateProjectInput (D-P1-3, D-P1-4)", () => {
  it("solo el id: un parche vacío, sin defaults que lo conviertan en reemplazo", () => {
    expect(updateProjectInput.parse({ id })).toEqual({ id });
  });

  it("cada campo por separado viaja solo", () => {
    expect(updateProjectInput.parse({ id, note: "  Nota  " })).toEqual({
      id,
      note: "Nota",
    });
    expect(updateProjectInput.parse({ id, color: "teal" })).toEqual({
      id,
      color: "teal",
    });
    expect(updateProjectInput.parse({ id, billableByDefault: false })).toEqual({
      id,
      billableByDefault: false,
    });
    expect(updateProjectInput.parse({ id, clientId: id })).toEqual({ id, clientId: id });
  });

  it("acepta clientId null, que es «Sin cliente» (PR-14)", () => {
    expect(updateProjectInput.parse({ id, clientId: null })).toEqual({
      id,
      clientId: null,
    });
  });

  it("rechaza el color null: asignarlo es del alta (PR-15)", () => {
    expect(updateProjectInput.safeParse({ id, color: null }).success).toBe(false);
    expect(updateProjectInput.safeParse({ id, color: "magenta" }).success).toBe(false);
  });

  it("rechaza una nota de más de 3000 caracteres y el carácter nulo en ella", () => {
    expect(updateProjectInput.safeParse({ id, note: "a".repeat(3000) }).success).toBe(
      true,
    );
    expect(messageOf(updateProjectInput.safeParse({ id, note: "a".repeat(3001) }))).toBe(
      projectMessages.noteTooLong,
    );
    expect(messageOf(updateProjectInput.safeParse({ id, note: "a\u0000" }))).toBe(
      projectMessages.nullCharacter,
    );
  });

  it("rechaza un facturable que no es booleano y un id que no es UUID", () => {
    expect(updateProjectInput.safeParse({ id, billableByDefault: "true" }).success).toBe(
      false,
    );
    expect(updateProjectInput.safeParse({ id: "web" }).success).toBe(false);
    expect(updateProjectInput.safeParse({ id, clientId: "acme" }).success).toBe(false);
  });

  it("acepta cualquier UUID como id: el proyecto puede venir de la importación", () => {
    expect(updateProjectInput.safeParse({ id: uuidV7 }).success).toBe(true);
  });
});

describe("projectsSearchParams (D-P1-6, ADR 0008)", () => {
  it.each(["activos", "archivados", "todos"] as const)("acepta ?estado=%s", (estado) => {
    expect(projectsSearchParams.parse({ estado })).toMatchObject({ estado });
  });

  it("sin parámetros, sin estado ni búsqueda", () => {
    const parsed = projectsSearchParams.parse({});
    expect(parsed.estado).toBeUndefined();
    expect(parsed.buscar).toBeUndefined();
  });

  it("un estado desconocido o repetido queda sin estado", () => {
    expect(projectsSearchParams.parse({ estado: "x" }).estado).toBeUndefined();
    expect(
      projectsSearchParams.parse({ estado: ["todos", "activos"] }).estado,
    ).toBeUndefined();
  });

  it("una búsqueda repetida o de más de 100 caracteres queda sin búsqueda", () => {
    expect(projectsSearchParams.parse({ buscar: ["web", "app"] }).buscar).toBeUndefined();
    expect(
      projectsSearchParams.parse({ buscar: "a".repeat(101) }).buscar,
    ).toBeUndefined();
    expect(projectsSearchParams.parse({ buscar: "a".repeat(100) }).buscar).toBe(
      "a".repeat(100),
    );
  });

  it("un estado inválido no se lleva la búsqueda válida, ni al revés", () => {
    expect(projectsSearchParams.parse({ estado: "x", buscar: "web" })).toMatchObject({
      buscar: "web",
    });
    expect(
      projectsSearchParams.parse({ estado: "todos", buscar: "a".repeat(101) }),
    ).toMatchObject({ estado: "todos" });
  });
});
