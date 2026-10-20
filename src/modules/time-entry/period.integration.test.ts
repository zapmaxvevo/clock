import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { timeEntry } from "@/server/db/schema";
import { buenosAires, seedMember, seedTimeEntry, seedWorkspace } from "@/test/factories";
import { actorIn, workspaceOf } from "@/test/time-entry";

import { ENTRIES_OF_PERIOD_MAX } from "./schema";
import { getRunningEntry, listEntriesOfPeriod } from "./service";

/**
 * D-MCP-8: la lectura de un período para el MCP. Cada entrada cuenta entera en
 * el día en que empieza, en la zona de la persona, como en el rastreador.
 */

const zone = workspaceOf(buenosAires);

async function seedPerson() {
  const seeded = await seedWorkspace();
  const userId = await seedMember(seeded.workspaceId, "member");
  return { seeded, userId, actor: actorIn(seeded.workspaceId, userId) };
}

describe("listEntriesOfPeriod", () => {
  it("corta por el día de inicio en la zona de la persona, con los extremos incluidos y el timer aparte", async () => {
    const { seeded, userId, actor } = await seedPerson();
    const seed = (startedAt: string, endedAt: string | null) =>
      seedTimeEntry({ workspaceId: seeded.workspaceId, userId, startedAt, endedAt });
    // 18/10 23:30 en Buenos Aires: fuera, aunque termine el 19.
    await seed("2026-10-19T02:30:00Z", "2026-10-19T04:00:00Z");
    // 19/10 00:00 en Buenos Aires: el primer instante del período.
    const first = await seed("2026-10-19T03:00:00Z", "2026-10-19T04:00:00Z");
    // 20/10 23:30 en Buenos Aires, cruza la medianoche: entra entera.
    const crossing = await seed("2026-10-21T02:30:00Z", "2026-10-21T04:30:00Z");
    // 21/10 00:00 en Buenos Aires: el día siguiente al período.
    await seed("2026-10-21T03:00:00Z", "2026-10-21T04:00:00Z");
    const running = await seed("2026-10-20T12:00:00Z", null);

    const period = await listEntriesOfPeriod(actor, zone, {
      from: "2026-10-19",
      to: "2026-10-20",
    });

    expect(period.from).toBe("2026-10-19");
    expect(period.to).toBe("2026-10-20");
    expect(period.entries.map((entry) => entry.id)).toEqual([first.id, crossing.id]);
    expect(period.entries.map((entry) => entry.dayDate)).toEqual([
      "2026-10-19",
      "2026-10-20",
    ]);
    expect(period.running?.id).toBe(running.id);
    expect(period.closedSeconds).toBe(3600 + 2 * 3600);
    expect(period.truncated).toBe(false);
  });

  it("solo las propias del workspace", async () => {
    const { seeded, actor } = await seedPerson();
    const other = await seedMember(seeded.workspaceId, "member");
    const elsewhere = await seedWorkspace();
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: other,
      startedAt: "2026-10-19T12:00:00Z",
      endedAt: "2026-10-19T13:00:00Z",
    });
    await seedTimeEntry({
      workspaceId: elsewhere.workspaceId,
      userId: elsewhere.ownerId,
      startedAt: "2026-10-19T12:00:00Z",
      endedAt: "2026-10-19T13:00:00Z",
    });
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: other,
      startedAt: "2026-10-19T14:00:00Z",
    });

    const period = await listEntriesOfPeriod(actor, zone, {
      from: "2026-10-19",
      to: "2026-10-19",
    });

    expect(period).toMatchObject({ entries: [], running: null, closedSeconds: 0 });
  });

  it(`con más de ${ENTRIES_OF_PERIOD_MAX}, las primeras por inicio y truncated`, async () => {
    const { seeded, userId, actor } = await seedPerson();
    const start = Date.parse("2026-10-19T03:00:00Z");
    await db.insert(timeEntry).values(
      Array.from({ length: ENTRIES_OF_PERIOD_MAX + 1 }, (_, index) => ({
        workspaceId: seeded.workspaceId,
        userId,
        startedAt: new Date(start + index * 60_000),
        endedAt: new Date(start + index * 60_000 + 30_000),
      })),
    );

    const period = await listEntriesOfPeriod(actor, zone, {
      from: "2026-10-19",
      to: "2026-10-19",
    });

    expect(period.entries).toHaveLength(ENTRIES_OF_PERIOD_MAX);
    expect(period.truncated).toBe(true);
    expect(period.entries.at(-1)?.startedAt).toBe(
      new Date(start + (ENTRIES_OF_PERIOD_MAX - 1) * 60_000).toISOString(),
    );
    expect(period.closedSeconds).toBe(ENTRIES_OF_PERIOD_MAX * 30);
  });

  it(`con ${ENTRIES_OF_PERIOD_MAX} justas, todas y sin truncated`, async () => {
    const { seeded, userId, actor } = await seedPerson();
    const start = Date.parse("2026-10-19T03:00:00Z");
    await db.insert(timeEntry).values(
      Array.from({ length: ENTRIES_OF_PERIOD_MAX }, (_, index) => ({
        workspaceId: seeded.workspaceId,
        userId,
        startedAt: new Date(start + index * 60_000),
        endedAt: new Date(start + index * 60_000 + 30_000),
      })),
    );

    const period = await listEntriesOfPeriod(actor, zone, {
      from: "2026-10-19",
      to: "2026-10-19",
    });

    expect(period.entries).toHaveLength(ENTRIES_OF_PERIOD_MAX);
    expect(period.truncated).toBe(false);
  });
});

describe("getRunningEntry", () => {
  it("el timer propio que corre, o null", async () => {
    const { seeded, userId, actor } = await seedPerson();
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId,
      startedAt: "2026-10-19T12:00:00Z",
      endedAt: "2026-10-19T13:00:00Z",
    });

    expect(await getRunningEntry(actor, zone)).toBeNull();

    const running = await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId,
      startedAt: "2026-10-19T14:00:00Z",
    });

    expect(await getRunningEntry(actor, zone)).toMatchObject({
      id: running.id,
      endedAt: null,
      dayDate: "2026-10-19",
      startClock: "11:00",
    });
  });

  it("no ve el de otra persona", async () => {
    const { seeded, actor } = await seedPerson();
    await seedTimeEntry({
      workspaceId: seeded.workspaceId,
      userId: seeded.ownerId,
      startedAt: "2026-10-19T14:00:00Z",
    });

    expect(await getRunningEntry(actor, zone)).toBeNull();
  });
});
