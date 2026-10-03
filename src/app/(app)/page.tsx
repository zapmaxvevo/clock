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
import { requireSession } from "@/server/session";

export default async function HomePage() {
  const session = await requireSession();
  // El modo de la barra se recuerda por navegador (TT-16). Leerlo acá es lo
  // que evita dibujar un modo y saltar al otro en el cliente.
  const mode = parseTrackerMode((await cookies()).get(TRACKER_MODE_COOKIE)?.value);

  return (
    <Suspense fallback={<TrackerSkeleton />}>
      <TrackerScreen
        actor={session.actor}
        workspace={session.workspace}
        initialMode={mode}
      />
    </Suspense>
  );
}
