import { describe, expect, it } from "vitest";

import { auditActorOf } from "./audit";

const actor = {
  userId: "u1",
  workspaceId: "11111111-1111-1111-1111-111111111111",
  role: "member",
  status: "active",
} as const;

describe("auditActorOf (D-MCP-12)", () => {
  it("desde la aplicación, la persona y el workspace, sin cliente", () => {
    expect(auditActorOf(actor)).toEqual({
      workspaceId: actor.workspaceId,
      actorId: "u1",
      oauthClientId: null,
    });
  });

  it("por MCP, también el cliente", () => {
    expect(auditActorOf({ ...actor, oauthClientId: "cliente" })).toEqual({
      workspaceId: actor.workspaceId,
      actorId: "u1",
      oauthClientId: "cliente",
    });
  });
});
