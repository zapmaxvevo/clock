import { notFound } from "next/navigation";

import { decideConsent } from "@/modules/mcp/actions";
import { ConsentScreen } from "@/modules/mcp/components/consent-screen";
import { getConsentView } from "@/modules/mcp/service";
import { env } from "@/server/env";
import { requireSession } from "@/server/session";

/** D-MCP-15: la pantalla de paso donde la persona autoriza un asistente. */
export default async function ConnectPage({ searchParams }: PageProps<"/conectar">) {
  // Antes de la sesión: con el MCP apagado, un anónimo también recibe 404.
  if (!env().MCP_ENABLED) {
    notFound();
  }
  const session = await requireSession();
  const view = await getConsentView(session, await searchParams);
  if (view.kind === "disabled") {
    notFound();
  }
  return <ConsentScreen view={view} decideConsent={decideConsent} />;
}
