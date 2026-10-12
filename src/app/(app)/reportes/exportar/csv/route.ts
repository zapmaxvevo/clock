import { handleReportExport } from "@/modules/report/export/handler";

export async function GET(request: Request): Promise<Response> {
  return handleReportExport(request, "csv");
}
