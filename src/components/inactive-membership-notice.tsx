import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * El aviso permanente de la membresía desactivada (TT-92, PF-46, RP-07). El
 * título es el mismo en todas las pantallas; el cuerpo dice qué se puede
 * hacer en cada una.
 */
export function InactiveMembershipNotice({ body }: { readonly body: string }) {
  return (
    <Alert>
      <InfoIcon aria-hidden="true" />
      <AlertTitle>Tu acceso al workspace está desactivado.</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
