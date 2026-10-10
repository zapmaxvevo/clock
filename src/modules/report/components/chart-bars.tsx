"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { activeBarIndex, narrowTickIndexesOf, nextBarIndex } from "./chart-model";

/** Una línea de la escala: su rótulo («2:00») y su altura en porcentaje del área. */
export type ChartScaleLine = { readonly label: string; readonly percent: number };

/** Una columna, ya armada en el servidor (§5.3). */
export type ChartBarView = {
  /** `firstDay`: la `key` de React de la columna. */
  readonly key: string;
  /** «{rótulo}[ solo {días}]: {duración}»: el nombre de la columna y el texto de la línea del valor. */
  readonly name: string;
  /** El alto de la barra en porcentaje del techo (D-R5-8). */
  readonly heightPercent: number;
  /** Con horas: la barra lleva el alto mínimo. */
  readonly hasHours: boolean;
  /** La marca, o `null` si esta columna no la muestra. */
  readonly tick: string | null;
  readonly tickAlign: "start" | "center" | "end";
};

const TICK_ALIGN = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
} as const satisfies Record<ChartBarView["tickAlign"], string>;

/**
 * D-R5-7, D-R5-9: la línea del valor, las columnas y las marcas. Muestra el
 * valor de la columna activa —la del puntero o, sin puntero, la del foco— y
 * mueve el foco entre las columnas con las flechas, Inicio y Fin, con una sola
 * parada de tabulación. Quien la monta le pone como `key` el `href` del
 * pedido, así cada navegación vuelve a empezar en la primera columna.
 */
export function ChartBars({
  scale,
  bars,
}: {
  readonly scale: readonly ChartScaleLine[];
  readonly bars: readonly ChartBarView[];
}) {
  const [tabStop, setTabStop] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const active = activeBarIndex(hovered, focused);
  // Con una sola barra, la columna tiene un ancho tope y va centrada (D-R5-8).
  const single = bars.length === 1;
  // Sale de la cantidad de columnas: no viaja en las props, que pesan en el payload RSC (§6.3).
  const narrowTicks = new Set(narrowTickIndexesOf(bars.length));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number): void {
    // Alt+flecha y los atajos con modificadores siguen siendo del navegador.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const next = nextBarIndex(index, event.key, bars.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    columns.current[next]?.focus();
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      {/* Dos renglones a lo angosto, donde el nombre más largo no entra en uno: la página no salta. */}
      <p aria-hidden="true" className="col-span-2 min-h-10 text-sm sm:min-h-5">
        {active === null ? null : bars[active]?.name}
      </p>

      <div
        aria-hidden="true"
        className="text-muted-foreground relative mt-2 text-xs tabular-nums"
      >
        {/*
         * Los rótulos, sin verse y sin alto, le dan a la columna de la escala
         * el ancho del más ancho: con dígitos proporcionales, «0:45» puede ser
         * más ancho que «1:00».
         */}
        {scale.map((line) => (
          <span key={line.label} className="invisible block h-0">
            {line.label}
          </span>
        ))}
        {scale.map((line) => (
          <span
            key={line.label}
            className="absolute right-0 translate-y-1/2"
            style={{ bottom: `${line.percent}%` }}
          >
            {line.label}
          </span>
        ))}
      </div>

      <div className="relative mt-2 h-40" onPointerLeave={() => setHovered(null)}>
        <div aria-hidden="true">
          {scale.map((line) => (
            <div
              key={line.label}
              className="border-border absolute inset-x-0 border-t"
              style={{ bottom: `${line.percent}%` }}
            />
          ))}
        </div>
        <div className="relative flex h-full justify-center gap-px">
          {bars.map((bar, index) => (
            <div
              key={bar.key}
              ref={(node) => {
                columns.current[index] = node;
              }}
              role="img"
              aria-label={bar.name}
              tabIndex={index === tabStop ? 0 : -1}
              onPointerEnter={() => setHovered(index)}
              onFocus={() => {
                setFocused(index);
                setTabStop(index);
              }}
              onBlur={() => setFocused(null)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "flex h-full min-w-0 flex-1 items-end",
                "focus-visible:outline-foreground focus-visible:outline-2 focus-visible:-outline-offset-2",
                "forced-colors:focus-visible:outline-[Highlight]",
                single && "max-w-12",
                index === active && "bg-muted",
              )}
            >
              {bar.hasHours && (
                <div
                  className={cn(
                    "min-h-0.5 w-full forced-colors:forced-color-adjust-none",
                    index === active
                      ? "bg-primary forced-colors:bg-[Highlight]"
                      : "bg-chart-2 forced-colors:bg-[CanvasText]",
                  )}
                  style={{ height: `${bar.heightPercent}%` }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/*
       * El ancho de las marcas lo mide la fila, que es un contenedor: debajo
       * de 24rem siete marcas de día se pisan, y se ven solo las de
       * `narrowTickIndexesOf` (D-R5-8).
       */}
      <div
        aria-hidden="true"
        className="text-muted-foreground @container col-start-2 mt-1 flex h-4 justify-center gap-px text-xs"
      >
        {bars.map((bar, index) => (
          <div
            key={bar.key}
            className={cn("relative min-w-0 flex-1", single && "max-w-12")}
          >
            {bar.tick !== null && (
              <span
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  TICK_ALIGN[bar.tickAlign],
                  !narrowTicks.has(index) && "hidden @min-[24rem]:block",
                )}
              >
                {bar.tick}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
