import { Suspense } from "react";

import { timeSettingsOf } from "@/modules/profile/service";
import { ReportScreen, ReportSkeleton } from "@/modules/report/components/report-screen";
import {
  NO_REPORT_FILTERS,
  reportGroupParams,
  reportRangeParams,
  reportSubgroupParams,
} from "@/modules/report/schema";
import { requireSession } from "@/server/session";

export default async function ReportPage({ searchParams }: PageProps<"/reportes">) {
  const session = await requireSession();
  const params = await searchParams;
  // RP-32: un rango inválido o repetido se descarta entero, y la agrupación y
  // los subniveles se validan cada uno por su lado; ninguno es un error.
  const range = reportRangeParams.safeParse(params);
  const groupBy = reportGroupParams.safeParse(params);
  const subgroups = reportSubgroupParams.safeParse(params);

  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportScreen
        actor={session.actor}
        settings={timeSettingsOf(session)}
        request={{
          range: range.success ? range.data : null,
          groupBy: groupBy.success ? groupBy.data : null,
          subgroups: subgroups.success ? subgroups.data : [],
          filters: NO_REPORT_FILTERS,
        }}
      />
    </Suspense>
  );
}
