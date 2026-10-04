import { cookies } from "next/headers";
import { Suspense } from "react";

import {
  CalendarScreen,
  CalendarSkeleton,
} from "@/modules/time-entry/components/calendar/calendar-screen";
import {
  CALENDAR_ZOOM_COOKIE,
  parseCalendarZoom,
} from "@/modules/time-entry/components/calendar/calendar-zoom";
import { calendarModeParams, calendarWeekParams } from "@/modules/time-entry/schema";
import { trackerWorkspaceOf } from "@/modules/time-entry/service";
import { requireSession } from "@/server/session";

export default async function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  const session = await requireSession();
  // El zoom se recuerda por navegador (CAL-12): leerlo acá dibuja el recordado
  // desde la primera respuesta.
  const zoom = parseCalendarZoom((await cookies()).get(CALENDAR_ZOOM_COOKIE)?.value);
  // CAL-17: un parámetro que no pasa el esquema se ignora; nunca es un error.
  const params = await searchParams;
  const week = calendarWeekParams.safeParse(params);
  const mode = calendarModeParams.safeParse(params);

  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarScreen
        actor={session.actor}
        workspace={trackerWorkspaceOf(session)}
        request={{
          mode: mode.success ? "day" : "week",
          day: week.success ? week.data.semana : null,
        }}
        initialZoom={zoom}
      />
    </Suspense>
  );
}
