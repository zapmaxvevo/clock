import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** TT-92: el aviso permanente de la membresía desactivada, en el rastreador y en el calendario. */
export function InactiveMembershipNotice() {
  return (
    <Alert>
      <InfoIcon aria-hidden="true" />
      <AlertTitle>Tu acceso al workspace está desactivado.</AlertTitle>
      <AlertDescription>
        Podés ver tus horas, pero no cargar ni modificar entradas. Pedile a quien
        administra el workspace que vuelva a activar tu membresía.
      </AlertDescription>
    </Alert>
  );
}
