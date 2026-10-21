"use client";

import { CircleAlertIcon, XIcon } from "lucide-react";
import { useRef, type FormEvent, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionFailure } from "@/hooks/use-action";

import { projectLabels } from "./labels";
import { useProjectNotices, useSurvivingNotice } from "./project-notices";

type CreateDialogFrameProps = {
  /** El título del diálogo. */
  readonly title: string;
  /** Lo que el formulario ya trae fijo, como el proyecto de una tarea. */
  readonly description?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Adónde vuelve el foco al cerrarse, por éxito o por la persona. */
  readonly finalFocus: () => HTMLElement | null;
  /** El botón que lo abre, si tiene uno; va dentro de la raíz del diálogo. */
  readonly trigger?: ReactNode;
  /** Al terminar de cerrarse, con su animación. */
  readonly onClosed?: () => void;
  readonly pending: boolean;
  readonly failure: ActionFailure | null;
  /** Nombra la operación que no se hizo (TT-90). */
  readonly failureTitle: string;
  /** Solo con `unexpected` (TT-89, PR-90). */
  readonly onRetry: (() => void) | undefined;
  readonly onSave: () => void;
  /** Los campos del formulario. */
  readonly children: ReactNode;
};

/**
 * El marco común de los diálogos de alta y de edición: el formulario, el aviso
 * arriba de «Guardar» con «Reintentar» y la regla de no cerrar mientras el
 * pedido viaja. Controlado por `open`; el foco final lo decide quien lo usa.
 */
export function CreateDialogFrame({
  title,
  description,
  open,
  onOpenChange,
  finalFocus,
  trigger,
  onClosed,
  pending,
  failure,
  failureTitle,
  onRetry,
  onSave,
  children,
}: CreateDialogFrameProps) {
  const saveRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(next: boolean): void {
    // Con un pedido en vuelo el diálogo no se cierra: la respuesta tardía
    // cerraría el diálogo que se abriera después o volvería a armar su id.
    if (!next && pending) {
      return;
    }
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // «Guardar» no pasa a `disabled` mientras el pedido viaja: perdería el
    // foco, que caería a `body`. Con `aria-disabled` se ignora el envío.
    if (pending) {
      return;
    }
    onSave();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) {
          onClosed?.();
        }
      }}
    >
      {trigger}
      {/* PR-54: con una dirección o nota larga, «Guardar» y el aviso siguen al alcance. */}
      <DialogContent
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={false}
      >
        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description === undefined ? null : (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          {children}
          {failure === null ? null : (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{failureTitle}</AlertTitle>
              <AlertDescription>{failure.message}</AlertDescription>
              {onRetry === undefined ? null : (
                // En la columna del texto: en la del ícono, la ensancharía.
                <div className="col-start-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // «Reintentar» se va con su aviso: el foco pasa antes a
                      // «Guardar», que sigue en el diálogo.
                      saveRef.current?.focus();
                      onRetry();
                    }}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
            </Alert>
          )}
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" />}
              aria-disabled={pending || undefined}
            >
              {projectLabels.cancel}
            </DialogClose>
            <Button ref={saveRef} type="submit" aria-disabled={pending || undefined}>
              {pending ? projectLabels.saving : projectLabels.save}
            </Button>
          </DialogFooter>
        </form>
        {/*
          La X de la primitiva se vería habilitada con el cierre bloqueado.
          Esta queda montada y con `aria-disabled` mientras el pedido viaja:
          desmontarla con el foco encima lo dejaría en `body`.
        */}
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
            />
          }
          aria-disabled={pending || undefined}
        >
          <XIcon aria-hidden="true" />
          <span className="sr-only">Cerrar</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

type CreateDialogProps = Omit<
  CreateDialogFrameProps,
  "finalFocus" | "trigger" | "onClosed"
> & {
  /**
   * Identifica el diálogo ante `ProjectNoticesProvider`; es la misma clave con
   * la que su `onFailure` reporta el aviso.
   */
  readonly noticeKey: string;
  /** El texto del botón de apertura; sin él, el botón dice el título. */
  readonly triggerLabel?: string;
  /** El nombre accesible del botón de apertura, si el texto solo no alcanza. */
  readonly triggerName?: string;
  readonly triggerIcon?: ReactNode;
  readonly triggerVariant?: "default" | "outline" | "ghost";
};

/**
 * Los diálogos de `/proyectos`: el marco con el botón que los abre, el foco de
 * vuelta al botón al cerrarse y el aviso que sobrevive si el diálogo sale del
 * árbol.
 */
export function CreateDialog({
  noticeKey,
  title,
  triggerLabel = title,
  triggerName,
  triggerIcon,
  triggerVariant = "default",
  onOpenChange,
  failure,
  ...frame
}: CreateDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { dismiss, focusTargetFor } = useProjectNotices();
  useSurvivingNotice(noticeKey, failure !== null);

  return (
    <CreateDialogFrame
      {...frame}
      title={title}
      failure={failure}
      onOpenChange={(next) => {
        // Abrir un diálogo es una operación nueva: baja el aviso de la pantalla.
        if (next) {
          dismiss();
        }
        onOpenChange(next);
      }}
      // Si el diálogo sale del árbol con su aviso, el disparador ya no está y
      // el foco sigue al aviso, a la región de la pantalla.
      finalFocus={() => triggerRef.current ?? focusTargetFor(noticeKey)}
      trigger={
        <DialogTrigger
          ref={triggerRef}
          render={<Button variant={triggerVariant} size="sm" />}
          aria-label={triggerName}
        >
          {triggerIcon}
          {triggerLabel}
        </DialogTrigger>
      }
    />
  );
}
