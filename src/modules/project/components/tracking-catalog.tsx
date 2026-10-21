"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ProjectActions, TrackingCatalog } from "@/modules/project/schema";

const TrackingCatalogContext = createContext<TrackingCatalog | null>(null);
const CreateProjectContext = createContext<ProjectActions["createProject"] | null>(null);

type TrackingCatalogProviderProps = {
  /** Ya filtrado con `project.track` y ordenado por el service (TT-08). */
  readonly catalog: TrackingCatalog;
  /**
   * D-P1-13: la action del alta para «Crear proyecto» del selector (TT-09).
   * La pasa la pantalla de servidor que monta el proveedor.
   */
  readonly createProject: ProjectActions["createProject"];
  readonly children: ReactNode;
};

/** El catálogo del selector, para la barra y cada fila sin pasarlo por props. */
export function TrackingCatalogProvider({
  catalog,
  createProject,
  children,
}: TrackingCatalogProviderProps) {
  return (
    <TrackingCatalogContext value={catalog}>
      <CreateProjectContext value={createProject}>{children}</CreateProjectContext>
    </TrackingCatalogContext>
  );
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

/** D-P1-13: la action del alta de proyecto, para TT-09. Lanza fuera del proveedor. */
export function useCreateProjectAction(): ProjectActions["createProject"] {
  const createProject = useContext(CreateProjectContext);
  if (createProject === null) {
    throw new Error("useCreateProjectAction necesita un TrackingCatalogProvider.");
  }
  return createProject;
}
