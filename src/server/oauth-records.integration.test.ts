import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { oauthConsent } from "@/server/db/schema";
import { seedMember, seedWorkspace } from "@/test/factories";
import { grantRowsOf, seedGrant, seedOAuthClient } from "@/test/oauth-grants";
import { auditFor } from "@/test/queries";
import { actorIn } from "@/test/time-entry";

import {
  deleteGrant,
  deleteGrantsOf,
  findClientName,
  hasGrant,
  listGrantsOf,
} from "./oauth-records";

/** D-MCP-5, D-MCP-6: lo que la aplicación lee y borra de las tablas del plugin. */

async function seedPeople() {
  const seeded = await seedWorkspace();
  const person = await seedMember(seeded.workspaceId, "member");
  const other = await seedMember(seeded.workspaceId, "member");
  return {
    seeded,
    person,
    other,
    actor: actorIn(seeded.workspaceId, person),
    owner: actorIn(seeded.workspaceId, seeded.ownerId, { role: "owner" }),
  };
}

describe("listGrantsOf", () => {
  it("una fila por cliente con el consentimiento más viejo, la más nueva primero", async () => {
    const { person } = await seedPeople();
    const older = await seedOAuthClient({
      name: "Viejo",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    const newer = await seedOAuthClient({ name: null });
    await seedGrant(person, older, {
      scopes: ["clock"],
      createdAt: new Date("2026-10-01T10:00:00Z"),
    });
    await seedGrant(person, older, {
      scopes: ["offline_access", "clock"],
      createdAt: new Date("2026-10-05T10:00:00Z"),
    });
    await seedGrant(person, newer, { createdAt: new Date("2026-10-10T10:00:00Z") });

    const grants = await db.transaction((tx) => listGrantsOf(tx, person));

    expect(grants).toEqual([
      {
        clientId: newer,
        clientName: null,
        redirectUris: ["http://127.0.0.1:4000/callback"],
        grantedAt: new Date("2026-10-10T10:00:00Z"),
      },
      {
        clientId: older,
        clientName: "Viejo",
        redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
        grantedAt: new Date("2026-10-01T10:00:00Z"),
      },
    ]);
  });

  it("no trae las de otra persona ni los clientes sin consentimiento", async () => {
    const { person, other } = await seedPeople();
    const client = await seedOAuthClient();
    await seedOAuthClient();
    await seedGrant(other, client);

    expect(await db.transaction((tx) => listGrantsOf(tx, person))).toEqual([]);
  });
});

describe("hasGrant y findClientName", () => {
  it("hasGrant responde por el par persona-cliente", async () => {
    const { person, other } = await seedPeople();
    const client = await seedOAuthClient();
    await seedGrant(person, client);

    expect(await hasGrant(person, client)).toBe(true);
    expect(await hasGrant(other, client)).toBe(false);
    expect(await hasGrant(person, "no-existe")).toBe(false);
  });

  it("findClientName da el nombre declarado, null sin nombre y undefined si no existe", async () => {
    const named = await seedOAuthClient({ name: "Claude" });
    const unnamed = await seedOAuthClient({ name: null });

    expect(await findClientName(named)).toEqual({ name: "Claude" });
    expect(await findClientName(unnamed)).toEqual({ name: null });
    expect(await findClientName("no-existe")).toBeUndefined();
  });
});

describe("deleteGrant (D-MCP-5)", () => {
  it("borra los consentimientos y los tokens del par, deja mcp.revoke con los alcances y no toca el otro cliente", async () => {
    const { person, actor } = await seedPeople();
    const client = await seedOAuthClient();
    const kept = await seedOAuthClient();
    await seedGrant(person, client, { scopes: ["clock"] });
    await seedGrant(person, client, { scopes: ["clock", "offline_access"] });
    await seedGrant(person, kept);

    const deleted = await db.transaction((tx) => deleteGrant(tx, actor, client));

    expect(deleted).toBe(true);
    expect(await hasGrant(person, client)).toBe(false);
    expect(await hasGrant(person, kept)).toBe(true);
    expect(await grantRowsOf(person)).toEqual({ consents: 1, refresh: 1, access: 1 });
    const audits = await auditFor("oauth_client", client);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "mcp.revoke",
      actorId: person,
      workspaceId: actor.workspaceId,
      oauthClientId: null,
      previousValue: JSON.stringify({ scopes: ["clock", "offline_access"] }),
      nextValue: null,
    });
  });

  it("con el actor que llegó por MCP, la constancia lleva su cliente", async () => {
    const { person, actor } = await seedPeople();
    const client = await seedOAuthClient();
    await seedGrant(person, client);

    await db.transaction((tx) =>
      deleteGrant(tx, { ...actor, oauthClientId: "otro-cliente" }, client),
    );

    expect((await auditFor("oauth_client", client))[0].oauthClientId).toBe(
      "otro-cliente",
    );
  });

  it("no borra lo de otra persona aunque el cliente exista, y sin nada que borrar no deja constancia", async () => {
    const { person, other, actor } = await seedPeople();
    const client = await seedOAuthClient();
    await seedGrant(other, client);

    const deleted = await db.transaction((tx) => deleteGrant(tx, actor, client));

    expect(deleted).toBe(false);
    expect(await grantRowsOf(other)).toEqual({ consents: 1, refresh: 1, access: 1 });
    expect(await grantRowsOf(person)).toEqual({ consents: 0, refresh: 0, access: 0 });
    expect(await auditFor("oauth_client")).toEqual([]);
  });

  it("dentro de una transacción que falla, no borra nada", async () => {
    const { person, actor } = await seedPeople();
    const client = await seedOAuthClient();
    await seedGrant(person, client);

    await expect(
      db.transaction(async (tx) => {
        await deleteGrant(tx, actor, client);
        throw new Error("después");
      }),
    ).rejects.toThrow("después");

    expect(await grantRowsOf(person)).toEqual({ consents: 1, refresh: 1, access: 1 });
    expect(await auditFor("oauth_client")).toEqual([]);
  });
});

describe("deleteGrantsOf (D-MCP-6)", () => {
  it("borra todo lo de la persona y deja mcp.revokeAll con la cantidad de clientes", async () => {
    const { person, other, owner } = await seedPeople();
    const first = await seedOAuthClient();
    const second = await seedOAuthClient();
    await seedGrant(person, first);
    await seedGrant(person, first);
    await seedGrant(person, second);
    await seedGrant(other, first);

    const clients = await db.transaction((tx) => deleteGrantsOf(tx, owner, person));

    expect(clients).toBe(2);
    expect(await grantRowsOf(person)).toEqual({ consents: 0, refresh: 0, access: 0 });
    expect(await grantRowsOf(other)).toEqual({ consents: 1, refresh: 1, access: 1 });
    const audits = await auditFor("user", person);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "mcp.revokeAll",
      actorId: owner.userId,
      previousValue: JSON.stringify({ clients: 2 }),
    });
  });

  it("un refresh sin consentimiento también se borra y cuenta su cliente", async () => {
    const { person, owner } = await seedPeople();
    const client = await seedOAuthClient();
    await seedGrant(person, client);
    await db.transaction((tx) =>
      deleteGrant(tx, actorIn(owner.workspaceId, person), client),
    );
    await seedGrant(person, client);
    await db.delete(oauthConsent);

    expect(await db.transaction((tx) => deleteGrantsOf(tx, owner, person))).toBe(1);
    expect(await grantRowsOf(person)).toEqual({ consents: 0, refresh: 0, access: 0 });
  });

  it("sin autorizaciones devuelve 0 y no deja constancia", async () => {
    const { person, owner } = await seedPeople();

    expect(await db.transaction((tx) => deleteGrantsOf(tx, owner, person))).toBe(0);
    expect(await auditFor("user", person)).toEqual([]);
  });
});
