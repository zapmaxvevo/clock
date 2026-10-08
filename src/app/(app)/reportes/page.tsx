import { Suspense } from "react";

import { timeSettingsOf } from "@/modules/profile/service";
import { ReportScreen, ReportSkeleton } from "@/modules/report/components/report-screen";
import { reportGroupParams, reportRangeParams } from "@/modules/report/schema";
import { requireSession } from "@/server/session";

export default async function ReportPage({ searchParams }: PageProps<"/reportes">) {
  const session = await requireSession();
  const params = await searchParams;
  // RP-32: un rango inválido o repetido se descarta entero y la agrupación se
  // valida por su lado; ninguno de los dos es un error.
  const range = reportRangeParams.safeParse(params);
  const groupBy = reportGroupParams.safeParse(params);

  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportScreen
        actor={session.actor}
        settings={timeSettingsOf(session)}
        request={{
          range: range.success ? range.data : null,
          groupBy: groupBy.success ? groupBy.data : null,
        }}
      />
    </Suspense>
  );
}
