"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import {
  mcpMessages,
  type ConsentView,
  type DecideConsentInput,
  type DecideConsentResult,
  type McpErrorCode,
} from "@/modules/mcp/schema";
import type { ActionResult } from "@/server/action";

import { consentLabels } from "./labels";

type ConsentScreenProps = {
  readonly view: ConsentView;
  /** La action llega por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly decideConsent: (
    input: DecideConsentInput,
  ) => Promise<ActionResult<DecideConsentResult, McpErrorCode>>;
};

/** El aviso de una decisión que no se hizo. */
export type ConsentFailure = { readonly title: string; readonly message: string };

/**
 * §5.1: `/conectar`, la pantalla de paso donde la persona autoriza o cancela,
 * en la caja de `/login`. Elegir manda la decisión con la consulta firmada y el
 * navegador sigue la dirección que responde el plugin (D-MCP-15); hasta que
 * la página se va, los botones quedan en `aria-disabled`. Una consulta vencida
 * pasa a `invalid`.
 */
export function ConsentScreen({ view, decideConsent }: ConsentScreenProps) {
  const [expired, setExpired] = useState(false);
  /** La decisión ya salió bien y el navegador está yéndose. */
  const [leaving, setLeaving] = useState(false);
  /** Lo último que se eligió: `true` es «Conectar». */
  const [accepting, setAccepting] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const decide = useAction(decideConsent, {
    unreachableMessage: mcpMessages.unexpectedConsent,
    onSuccess: (data) => {
      setLeaving(true);
      window.location.assign(data.redirectTo);
    },
    onFailure: (failure) => {
      if (failure.code === "consent_expired") {
        setExpired(true);
      }
    },
  });

  // Con `invalid` los botones se van con el foco: pasa al título.
  useEffect(() => {
    if (expired) {
      headingRef.current?.focus();
    }
  }, [expired]);

  const busy = decide.pending || leaving;
  const failure =
    decide.failure === null || decide.failure.code === "consent_expired"
      ? null
      : {
          title: accepting ? consentLabels.connectFailed : consentLabels.cancelFailed,
          message: decide.failure.message,
        };

  function choose(accept: boolean): void {
    if (busy || view.kind === "invalid") {
      return;
    }
    setAccepting(accept);
    decide.run({ oauthQuery: view.oauthQuery, accept });
  }

  return (
    <ConsentCard
      view={expired ? { kind: "invalid" } : view}
      busy={busy}
      accepting={accepting}
      failure={failure}
      headingRef={headingRef}
      onChoose={choose}
    />
  );
}

type ConsentCardProps = {
  readonly view: ConsentView;
  /** Un pedido en curso, o el navegador yéndose después del éxito. */
  readonly busy: boolean;
  /** Si lo que viaja es «Conectar»: el primario dice «Conectando…». */
  readonly accepting: boolean;
  readonly failure: ConsentFailure | null;
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
  readonly onChoose: (accept: boolean) => void;
};

/** La pantalla sin estado. */
export function ConsentCard({
  view,
  busy,
  accepting,
  failure,
  headingRef,
  onChoose,
}: ConsentCardProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border p-8">
        <div className="space-y-2">
          {/* Con `tabIndex={-1}`: recibe el foco cuando la consulta vence y los botones se van. */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="focus-visible:ring-ring/50 text-xl font-semibold break-words outline-none focus-visible:ring-3"
          >
            {view.kind === "ready"
              ? consentLabels.title(view.clientName)
              : consentLabels.genericTitle}
          </h1>
          {view.kind === "ready" && (
            <>
              <p className="text-sm break-words">
                {consentLabels.body(view.clientName, view.email)}
              </p>
              {view.seesTeam && <p className="text-sm">{consentLabels.teamBody}</p>}
              <p className="text-muted-foreground text-sm break-words">
                {consentLabels.returnsTo(view.returnsTo)}
              </p>
              <p className="text-muted-foreground text-sm">{consentLabels.revokeLater}</p>
            </>
          )}
          {view.kind === "forbidden" && (
            <p className="text-sm">{mcpMessages.consentForbidden}</p>
          )}
          {view.kind === "invalid" && <p className="text-sm">{consentLabels.invalid}</p>}
        </div>
        {failure !== null && (
          <ActionFeedback title={failure.title} message={failure.message} />
        )}
        {view.kind !== "invalid" && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              // Con `aria-disabled` y no con `disabled`: el botón conserva el
              // foco mientras el pedido viaja. Que el clic no mande lo decide
              // `onChoose`.
              aria-disabled={busy || undefined}
              onClick={() => onChoose(false)}
            >
              {consentLabels.cancel}
            </Button>
            {view.kind === "ready" && (
              <Button
                type="button"
                aria-disabled={busy || undefined}
                onClick={() => onChoose(true)}
              >
                {busy && accepting ? consentLabels.connecting : consentLabels.connect}
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
