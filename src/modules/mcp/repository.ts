import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { mcpCallWindow } from "@/server/db/schema";

/**
 * Único lugar con acceso a datos del módulo. `mcp_call_window` es de la cuenta
 * y no tiene workspace: filtra por el `user_id` del token, nunca por uno de la
 * entrada. Las autorizaciones viven en `src/server/oauth-records.ts` (ADR 0025).
 */
export const mcpRepository = {
  /**
   * D-MCP-13: suma un pedido al minuto en curso de `userId`, o reinicia la ventana si
   * el minuto cambió, en una sentencia; devuelve los pedidos del minuto.
   */
  async consumeCall(userId: string): Promise<number> {
    const rows = await db
      .insert(mcpCallWindow)
      .values({ userId, windowStart: sql`date_trunc('minute', now())`, calls: 1 })
      .onConflictDoUpdate({
        target: mcpCallWindow.userId,
        set: {
          calls: sql`case when ${mcpCallWindow.windowStart} = excluded.window_start then ${mcpCallWindow.calls} + 1 else 1 end`,
          windowStart: sql`excluded.window_start`,
        },
      })
      .returning({ calls: mcpCallWindow.calls });
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error("La ventana de pedidos no devolvió su fila.");
    }
    return row.calls;
  },
};
