"use client";

import { CircleAlertIcon } from "lucide-react";
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

type CreateDialogProps = {
  /**
   * Identifica el diálogo ante `ProjectNoticesProvider`; es la misma clave con
   * la que su `onFailure` reporta el aviso.
   */
  readonly noticeKey: string;
  /** El texto del botón de apertura, que es también el título del diálogo. */
  readonly title: string;
  /** El nombre accesible del botón de apertura, si el texto solo no alcanza. */
  readonly triggerName?: string;
  readonly triggerIcon?: ReactNode;
  readonly triggerVariant?: "default" | "outline" | "ghost";
  /** Lo que el alta ya trae fijo, como el proyecto de una tarea. */
  readonly description?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pending: boolean;
  readonly failure: ActionFailure | null;
  /** Nombra la operación que no se hizo (TT-90). */
  readonly failureTitle: string;
  /** Solo con `unexpected` (TT-89, PR-90). */
  readonly onRetry: (() => void) | undefined;
  readonly onSave: () => void;
  /** Los campos del alta. */
  readonly children: ReactNode;
};

/**
 * El marco común de los tres diálogos de alta: el botón que los abre, el
 * formulario, el aviso arriba de «Guardar» y el foco de vuelta al botón al
 * cerrarse, por éxito o por la persona.
 */
export function CreateDialog({
  noticeKey,
  title,
  triggerName,
  triggerIcon,
  triggerVariant = "default",
  description,
  open,
  onOpenChange,
  pending,
  failure,
  failureTitle,
  onRetry,
  onSave,
  children,
}: CreateDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const { dismiss, focusTargetFor } = useProjectNotices();
  useSurvivingNotice(noticeKey, failure !== null);

  function handleOpenChange(next: boolean): void {
    // Con un pedido en vuelo el diálogo no se cierra: la respuesta tardía
    // cerraría el diálogo que se abriera después o volvería a armar su id.
    if (!next && pending) {
      return;
    }
    // Abrir un diálogo es una operación nueva: baja el aviso de la pantalla.
    if (next) {
      dismiss();
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        ref={triggerRef}
        render={<Button variant={triggerVariant} size="sm" />}
        aria-label={triggerName}
      >
        {triggerIcon}
        {title}
      </DialogTrigger>
      {/* PR-54: con una dirección o nota larga, «Guardar» y el aviso siguen al alcance. */}
      <DialogContent
        // Si el diálogo sale del árbol con su aviso, el disparador ya no está y
        // el foco sigue al aviso, a la región de la pantalla.
        finalFocus={() => triggerRef.current ?? focusTargetFor(noticeKey)}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
      </DialogContent>
    </Dialog>
  );
}
