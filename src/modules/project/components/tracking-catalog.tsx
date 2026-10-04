"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { TrackingCatalog } from "@/modules/project/schema";

const TrackingCatalogContext = createContext<TrackingCatalog | null>(null);

type TrackingCatalogProviderProps = {
  /** Ya filtrado con `project.track` y ordenado por el service (TT-08). */
  readonly catalog: TrackingCatalog;
  readonly children: ReactNode;
};

/** El catálogo del selector, para la barra y cada fila sin pasarlo por props. */
export function TrackingCatalogProvider({
  catalog,
  children,
}: TrackingCatalogProviderProps) {
  return <TrackingCatalogContext value={catalog}>{children}</TrackingCatalogContext>;
}

/**
 * Lanza fuera del proveedor: un catálogo vacío por omisión haría que el
 * selector dijera «No hay proyectos todavía» sin que nadie lo note.
 */
export function useTrackingCatalog(): TrackingCatalog {
  const catalog = useContext(TrackingCatalogContext);
  if (catalog === null) {
    throw new Error("useTrackingCatalog necesita un TrackingCatalogProvider.");
  }
  return catalog;
}
