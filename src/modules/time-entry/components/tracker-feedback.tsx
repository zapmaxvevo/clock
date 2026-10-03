import { CircleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type TrackerFeedbackProps = {
  /** Nombra el campo o la operación que falló (TT-90). */
  readonly title: string;
  /** Mensaje del resultado tipado de la action. */
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retryDisabled?: boolean;
};

/**
 * Aviso de error de una action. El ícono y el texto llevan la información; el
 * color no es lo único que distingue el estado.
 */
export function TrackerFeedback({
  title,
  message,
  onRetry,
  retryDisabled = false,
}: TrackerFeedbackProps) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRetry === undefined ? null : (
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={retryDisabled}
            onClick={onRetry}
          >
            Reintentar
          </Button>
        </div>
      )}
    </Alert>
  );
}
