import { CircleAlertIcon, InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ActionFeedbackProps = {
  /** Nombra el campo o la operación de la que informa (TT-90). */
  readonly title: string;
  /** Mensaje del resultado tipado de la action, o el del aviso informativo. */
  readonly message: string;
  /** `info` es para lo que salió bien y hay que contar igual. */
  readonly tone?: "error" | "info";
  readonly onRetry?: () => void;
  readonly retryDisabled?: boolean;
};

/**
 * Aviso de una action: el error de la que falló o la información de la que
 * salió bien con algo que contar. El ícono y el texto llevan la información;
 * el color no es lo único que distingue el estado.
 */
export function ActionFeedback({
  title,
  message,
  tone = "error",
  onRetry,
  retryDisabled = false,
}: ActionFeedbackProps) {
  return (
    <Alert
      variant={tone === "error" ? "destructive" : "default"}
      // La primitiva fija `role="alert"`, que interrumpe la lectura en curso.
      // Lo que salió bien se anuncia cuando el lector llega, no antes.
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <CircleAlertIcon aria-hidden="true" />
      ) : (
        <InfoIcon aria-hidden="true" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRetry === undefined ? null : (
        // En la columna del texto: en la del ícono, la ensancharía.
        <div className="col-start-2 mt-2">
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
