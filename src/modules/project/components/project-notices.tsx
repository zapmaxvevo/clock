"use client";

import { CircleAlertIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Notice = {
  /** El diálogo que lo produjo. */
  readonly key: string;
  /** Nombra la operación que no se hizo (TT-90). */
  readonly title: string;
  readonly message: string;
};

type ProjectNotices = {
  /** El aviso de un alta que falló, antes de que la revalidación llegue al árbol. */
  readonly report: (notice: Notice) => void;
  /** El diálogo bajó su aviso: ya no hay nada que rescatar. */
  readonly settle: (key: string) => void;
  /** El diálogo salió del árbol: si tenía un aviso, lo muestra la pantalla. */
  readonly orphan: (key: string) => void;
  /** Una operación nueva baja el aviso de la pantalla. */
  readonly dismiss: () => void;
  /**
   * Adónde va el foco cuando el diálogo sale del árbol: la región, si su
   * aviso pasa a la pantalla; si no, `null`.
   */
  readonly focusTargetFor: (key: string) => HTMLElement | null;
};

type NoticeRegion = {
  readonly shown: Notice | null;
  readonly ref: RefObject<HTMLDivElement | null>;
};

const NoticesContext = createContext<ProjectNotices | null>(null);
const RegionContext = createContext<NoticeRegion | null>(null);

/**
 * PR-72, PR-84 y PR-60: con `not_found` o `forbidden`, la revalidación de
 * `/proyectos` puede traer un catálogo sin el diálogo que falló —el proyecto
 * se archivó, la persona dejó de ser responsable o su membresía se
 * desactivó—, y su aviso se iría con él. El aviso se guarda acá al fallar, y
 * si el diálogo sale del árbol lo muestra la pantalla, que sobrevive.
 */
export function ProjectNoticesProvider({ children }: { readonly children: ReactNode }) {
  const reported = useRef<Notice | null>(null);
  /** El diálogo cuyo aviso pasó a la pantalla, hasta la operación siguiente. */
  const orphaned = useRef<string | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Notice | null>(null);

  const notices = useMemo<ProjectNotices>(
    () => ({
      report: (notice) => {
        reported.current = notice;
      },
      settle: (key) => {
        if (reported.current?.key === key) {
          reported.current = null;
        }
      },
      orphan: (key) => {
        const notice = reported.current;
        if (notice?.key !== key) {
          return;
        }
        reported.current = null;
        orphaned.current = key;
        setShown(notice);
      },
      dismiss: () => {
        orphaned.current = null;
        setShown(null);
      },
      focusTargetFor: (key) =>
        reported.current?.key === key || orphaned.current === key
          ? regionRef.current
          : null,
    }),
    [],
  );

  return (
    <NoticesContext value={notices}>
      <RegionContext value={{ shown, ref: regionRef }}>{children}</RegionContext>
    </NoticesContext>
  );
}

export function useProjectNotices(): ProjectNotices {
  const notices = useContext(NoticesContext);
  if (notices === null) {
    throw new Error("useProjectNotices necesita un ProjectNoticesProvider.");
  }
  return notices;
}

/**
 * Engancha un diálogo de alta al proveedor: mientras está montado, su aviso
 * lo muestra él; si sale del árbol con un aviso pendiente, pasa a la pantalla.
 */
export function useSurvivingNotice(key: string, failureVisible: boolean): void {
  const { settle, orphan } = useProjectNotices();

  useEffect(() => {
    if (!failureVisible) {
      settle(key);
    }
  }, [failureVisible, key, settle]);

  useEffect(() => () => orphan(key), [key, orphan]);
}

/**
 * La región de la pantalla para el aviso de un diálogo que ya no está. Está
 * siempre montada: el diálogo que se va la pide como `finalFocus`, así el
 * foco no vuelve a otro control, y la región lo toma cuando el aviso llega.
 */
export function ProjectNoticeRegion() {
  const region = useContext(RegionContext);
  if (region === null) {
    throw new Error("ProjectNoticeRegion necesita un ProjectNoticesProvider.");
  }
  const { shown, ref } = region;

  useEffect(() => {
    if (shown !== null) {
      ref.current?.focus();
    }
  }, [shown, ref]);

  return (
    <div ref={ref} role="alert" tabIndex={-1} className="rounded-lg empty:hidden">
      {shown === null ? null : (
        // La región ya es el `alert`: la primitiva no repite el rol.
        <Alert role={undefined} variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{shown.title}</AlertTitle>
          <AlertDescription>{shown.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
