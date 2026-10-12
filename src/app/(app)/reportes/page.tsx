import { Suspense } from "react";

import { timeSettingsOf } from "@/modules/profile/service";
import { ReportScreen, ReportSkeleton } from "@/modules/report/components/report-screen";
import { reportRequestOf } from "@/modules/report/request";
import { requireSession } from "@/server/session";

export default async function ReportPage({ searchParams }: PageProps<"/reportes">) {
  const session = await requireSession();
  const request = reportRequestOf(await searchParams);

  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportScreen
        actor={session.actor}
        settings={timeSettingsOf(session)}
        request={request}
      />
    </Suspense>
  );
}
