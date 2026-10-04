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

type CreateDialogProps = {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        ref={triggerRef}
        render={<Button variant={triggerVariant} size="sm" />}
        aria-label={triggerName}
      >
        {triggerIcon}
        {title}
      </DialogTrigger>
      <DialogContent finalFocus={triggerRef}>
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
            <DialogClose render={<Button type="button" variant="outline" />}>
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
