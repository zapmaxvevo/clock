"use client";

import { useRouter } from "next/navigation";
import { useId, useOptimistic, useTransition } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAM_FILTERS, type TeamFilter } from "@/modules/team/schema";

import { teamLabels } from "./labels";
import { filterHref } from "./team-members-model";

/** Las opciones del selector, en el orden de §5.2. */
export const statusFilterItems = TEAM_FILTERS.map((filter) => ({
  value: filter,
  label: teamLabels.filters[filter],
}));

/**
 * D-E2-8: el filtro de estado, que vive en la URL. Elegir navega, como los
 * filtros del reporte; mientras la página nueva llega, el disparador ya dice
 * lo elegido. No se vuelve a montar con el filtro nuevo: el foco se queda en
 * el disparador (§5.2).
 */
export function StatusFilter({ filter }: { readonly filter: TeamFilter }) {
  const router = useRouter();
  const controlId = useId();
  const [shown, show] = useOptimistic<TeamFilter, TeamFilter>(filter, (_, next) => next);
  const [, startTransition] = useTransition();

  function choose(next: string | null): void {
    const chosen = TEAM_FILTERS.find((candidate) => candidate === next);
    if (chosen === undefined || chosen === shown) {
      return;
    }
    startTransition(() => {
      show(chosen);
      router.push(filterHref(chosen));
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={controlId}>{teamLabels.statusFilter}</Label>
      <Select items={statusFilterItems} value={shown} onValueChange={choose}>
        <SelectTrigger id={controlId} size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusFilterItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
