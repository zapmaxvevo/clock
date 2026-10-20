import { notFound } from "next/navigation";

import { decideConsent } from "@/modules/mcp/actions";
import { ConsentScreen } from "@/modules/mcp/components/consent-screen";
import { getConsentView } from "@/modules/mcp/service";
import { env } from "@/server/env";
import { requireSession } from "@/server/session";

/** D-MCP-15: la pantalla de paso donde la persona autoriza un asistente. */
export default async function ConnectPage({ searchParams }: PageProps<"/conectar">) {
  if (!env().MCP_ENABLED) {
    notFound();
  }
  const session = await requireSession();
  const view = await getConsentView(session, await searchParams);
  return <ConsentScreen view={view} decideConsent={decideConsent} />;
}
