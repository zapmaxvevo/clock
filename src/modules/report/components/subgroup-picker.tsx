"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReportGroupBy, ReportGrouping, ReportRange } from "@/modules/report/schema";

import { levelOptions, withLevel } from "./grouping-model";
import { groupByLabels, reportLabels } from "./labels";
import { reportHref } from "./report-href";

type SubgroupProps = {
  readonly range: ReportRange;
  readonly grouping: ReportGrouping;
  /** 1 es el segundo nivel; 2, el tercero. */
  readonly level: 1 | 2;
};

const LEVEL_LABELS = {
  1: reportLabels.secondLevel,
  2: reportLabels.thirdLevel,
} as const satisfies Record<SubgroupProps["level"], string>;

/** Lo elegido en el nivel, o `null` con «Ninguno». */
function chosenAt({ subgroups }: ReportGrouping, level: 1 | 2): ReportGroupBy | null {
  return subgroups[level - 1] ?? null;
}

/**
 * D-R3-8: el botón de un subnivel, que dice lo elegido, y su lista en un
 * popover. Elegir cierra el popover y el foco vuelve al botón, como un atajo
 * del período. Recibe solo el rango, la agrupación y su nivel (§5.3).
 */
export function SubgroupPicker({ range, grouping, level }: SubgroupProps) {
  const [open, setOpen] = useState(false);
  const chosen = chosenAt(grouping, level);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {reportLabels.levelChoice(
          LEVEL_LABELS[level],
          chosen === null ? reportLabels.noLevel : groupByLabels[chosen],
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align="start">
        <SubgroupPanel
          range={range}
          grouping={grouping}
          level={level}
          onChoose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * La lista de un subnivel, sin el popover: «Ninguno» y lo que no está arriba,
 * cada uno un enlace a la agrupación que resulta de elegirlo (§5.2).
 */
export function SubgroupPanel({
  range,
  grouping,
  level,
  onChoose,
}: SubgroupProps & {
  /** Al elegir, antes de navegar. */
  readonly onChoose: () => void;
}) {
  const chosen = chosenAt(grouping, level);
  const options: readonly (ReportGroupBy | null)[] = [
    null,
    ...levelOptions(grouping, level),
  ];

  return (
    <ul aria-label={LEVEL_LABELS[level]} className="flex flex-col gap-0.5">
      {options.map((option) => {
        const current = option === chosen;
        return (
          <li key={option ?? "ninguno"}>
            <Link
              href={reportHref({ range, ...withLevel(grouping, level, option) })}
              aria-current={current ? "true" : undefined}
              // Solo en la navegación de la app: con Ctrl o Cmd abre otra
              // pestaña y la lista sigue abierta.
              onNavigate={onChoose}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "w-full justify-start",
                current ? "bg-secondary font-semibold" : "font-normal",
              )}
            >
              {option === null ? reportLabels.noLevel : groupByLabels[option]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
