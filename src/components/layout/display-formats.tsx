"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DisplayFormats } from "@/server/time";

const DisplayFormatsContext = createContext<DisplayFormats | null>(null);

/**
 * Los formatos de quien mira (ADR 0012): la hora y la fecha son suyas; la
 * duración, del workspace (ADR 0029). El layout monta el de base; cada
 * pantalla que muestra horas, fechas o duraciones monta el suyo con su propia
 * lectura, porque una navegación del cliente conserva el layout con los
 * formatos que tenía.
 */
export function DisplayFormatsProvider({
  formats,
  children,
}: {
  readonly formats: DisplayFormats;
  readonly children: ReactNode;
}) {
  return <DisplayFormatsContext value={formats}>{children}</DisplayFormatsContext>;
}

/**
 * Los formatos del proveedor más cercano. Lanza sin proveedor: un valor por
 * omisión escondería que falta, y quien eligió 12 h vería 24 h.
 */
export function useDisplayFormats(): DisplayFormats {
  const formats = useContext(DisplayFormatsContext);
  if (formats === null) {
    throw new Error("useDisplayFormats necesita un DisplayFormatsProvider.");
  }
  return formats;
}
