import { cookies } from "next/headers";
import { Suspense } from "react";

import {
  TrackerScreen,
  TrackerSkeleton,
} from "@/modules/time-entry/components/tracker-screen";
import {
  parseTrackerMode,
  TRACKER_MODE_COOKIE,
} from "@/modules/time-entry/components/tracker-mode";
import { trackerSearchParams } from "@/modules/time-entry/schema";
import { trackerWorkspaceOf } from "@/modules/time-entry/service";
import { requireSession } from "@/server/session";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const session = await requireSession();
  // El modo de la barra se recuerda por navegador (TT-16). Leerlo acá es lo
  // que evita dibujar un modo y saltar al otro en el cliente.
  const mode = parseTrackerMode((await cookies()).get(TRACKER_MODE_COOKIE)?.value);
  // ADR 0008: un `desde` que no pasa el esquema se ignora; nunca es un error.
  const search = trackerSearchParams.safeParse(await searchParams);

  return (
    <Suspense fallback={<TrackerSkeleton />}>
      <TrackerScreen
        actor={session.actor}
        workspace={trackerWorkspaceOf(session)}
        from={search.success ? search.data.desde : null}
        initialMode={mode}
      />
    </Suspense>
  );
}
