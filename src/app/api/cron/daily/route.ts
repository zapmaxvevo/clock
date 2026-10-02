import { NextResponse } from "next/server";

import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Único trabajo programado del proyecto. El plan Hobby de Vercel admite una
 * corrida diaria, así que el bloqueo automático de timesheets, los
 * recordatorios y los reportes programados se agregan acá, en ese orden.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const ranAt = new Date().toISOString();
  return NextResponse.json({ ranAt, jobs: [] });
}
