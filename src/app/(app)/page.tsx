import { Suspense } from "react";

import {
  TrackerScreen,
  TrackerSkeleton,
} from "@/modules/time-entry/components/tracker-screen";
import { requireSession } from "@/server/session";

export default async function HomePage() {
  const session = await requireSession();

  return (
    <Suspense fallback={<TrackerSkeleton />}>
      <TrackerScreen actor={session.actor} timeZone={session.workspace.timezone} />
    </Suspense>
  );
}
