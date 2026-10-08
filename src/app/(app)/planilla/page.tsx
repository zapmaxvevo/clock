import { Suspense } from "react";

import {
  TimesheetScreen,
  TimesheetSkeleton,
} from "@/modules/time-entry/components/timesheet/timesheet-screen";
import { timesheetWeekParams } from "@/modules/time-entry/schema";
import { trackerWorkspaceOf } from "@/modules/time-entry/service";
import { requireSession } from "@/server/session";

export default async function TimesheetPage({ searchParams }: PageProps<"/planilla">) {
  const session = await requireSession();
  // TS-10: un parámetro inválido o repetido se ignora; nunca es un error.
  const week = timesheetWeekParams.safeParse(await searchParams);

  return (
    <Suspense fallback={<TimesheetSkeleton />}>
      <TimesheetScreen
        actor={session.actor}
        workspace={trackerWorkspaceOf(session)}
        request={{ day: week.success ? week.data.semana : null }}
      />
    </Suspense>
  );
}
