import { cn } from "@/lib/utils";
import type { ReportChart as ReportChartState } from "@/modules/report/schema";
import { formatDuration, type DurationFormat } from "@/server/time";

import { ChartBars, type ChartBarView } from "./chart-bars";
import {
  barHeightPercent,
  chartScaleOf,
  tickAlignOf,
  tickIndexesOf,
} from "./chart-model";
import { PartialHeading } from "./group-heading";
import { chartCaptions, groupByLabels, reportLabels } from "./labels";
import { durationColumnWidth } from "./report-view";

/**
 * RP-15, D-R5-7 a D-R5-9: el gráfico de barras, nombrado por su leyenda. Arma
 * la escala, los nombres, las alturas y las marcas y se los pasa a
 * `ChartBars`, que solo dibuja e interactúa; debajo, la tabla de datos, que se
 * abre sin JavaScript. Las duraciones, con el formato del workspace (D-WS2b-8).
 */
export function ReportChart({
  chart,
  durationFormat,
}: {
  readonly chart: ReportChartState;
  readonly durationFormat: DurationFormat;
}) {
  const scale = chartScaleOf(chart.bars);
  const ticks = new Set(tickIndexesOf(chart.bars.length));
  const bars = chart.bars.map((bar, index): ChartBarView => ({
    key: bar.firstDay,
    name: reportLabels.chartBar(
      bar.partial === null
        ? bar.label
        : `${bar.label} ${reportLabels.partialDays(bar.partial)}`,
      formatDuration(bar.seconds, durationFormat),
    ),
    heightPercent: barHeightPercent(bar.seconds, scale),
    hasHours: bar.seconds > 0,
    tick: ticks.has(index) ? bar.tick : null,
    tickAlign: tickAlignOf(index, chart.bars.length),
  }));

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">
        {chartCaptions[chart.granularity]}
      </figcaption>
      <ChartBars
        scale={scale.lines.map((seconds) => ({
          label: formatDuration(seconds, durationFormat),
          percent: barHeightPercent(seconds, scale),
        }))}
        bars={bars}
      />
      <details className="text-sm">
        <summary className="focus-visible:ring-ring w-fit cursor-pointer rounded-md focus-visible:ring-3 focus-visible:outline-hidden">
          {reportLabels.chartData}
        </summary>
        <div className="mt-2 overflow-x-auto rounded-lg border">
          <table className="w-full table-fixed">
            <thead className="border-b">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {groupByLabels[chart.granularity]}
                </th>
                <th
                  scope="col"
                  className={cn(
                    durationColumnWidth(durationFormat),
                    "px-3 py-2 text-right font-medium",
                  )}
                >
                  {reportLabels.duration}
                </th>
              </tr>
            </thead>
            <tbody>
              {chart.bars.map((bar) => (
                <tr key={bar.firstDay} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <PartialHeading partial={bar.partial}>{bar.label}</PartialHeading>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDuration(bar.seconds, durationFormat)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
