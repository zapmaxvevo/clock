"use client";

import { useId, useOptimistic, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/use-action";
import {
  mcpMessages,
  type GrantsView,
  type GrantView,
  type McpErrorCode,
  type RevokeGrantInput,
  type RevokeGrantResult,
} from "@/modules/mcp/schema";
import type { ActionResult } from "@/server/action";

import { grantsLabels } from "./labels";
import {
  GRANTS_HEADING_ID,
  RevokeGrantDialog,
  revokeGrantButtonId,
} from "./revoke-grant-dialog";

type AssistantGrantsProps = {
  /** Con el MCP apagado la página no dibuja la sección (D-MCP-14). */
  readonly view: Omit<Extract<GrantsView, { kind: "ready" }>, "kind">;
  /** La action llega por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly revokeGrant: (
    input: RevokeGrantInput,
  ) => Promise<ActionResult<RevokeGrantResult, McpErrorCode>>;
};

/** El último desenlace de «Desconectar», con el nombre de la fila al confirmar. */
type GrantsOutcome =
  | { readonly kind: "revoked"; readonly name: string }
  | {
      readonly kind: "failed";
      readonly name: string;
      readonly message: string;
      /** Solo con `unexpected`, como `retryHandlerOf`. */
      readonly retry: boolean;
    };

/** El aviso de la sección. */
export type GrantsFeedback = {
  readonly tone: "error" | "info";
  readonly title: string;
  readonly message?: string;
  readonly retry: boolean;
};

/** Cómo terminó el último «Copiar». */
export type CopyState = "idle" | "copied" | "failed";

function feedbackOf(outcome: GrantsOutcome | null): GrantsFeedback | null {
  if (outcome === null) {
    return null;
  }
  if (outcome.kind === "revoked") {
    return { tone: "info", title: grantsLabels.revoked(outcome.name), retry: false };
  }
  return {
    tone: "error",
    title: grantsLabels.revokeFailed(outcome.name),
    message: outcome.message,
    retry: outcome.retry,
  };
}

/**
 * §5.3: «Asistentes conectados» en `/perfil`, con la dirección para conectar y
 * las autorizaciones propias, una por cliente. Desconectar se confirma y saca
 * la fila en el acto; si la action falla, la fila vuelve sola con la vista
 * optimista. Un pedido a la vez.
 */
export function AssistantGrants({ view, revokeGrant }: AssistantGrantsProps) {
  const [grants, hide] = useOptimistic<readonly GrantView[], string>(
    view.grants,
    (current, clientId) => current.filter((grant) => grant.clientId !== clientId),
  );
  const [outcome, setOutcome] = useState<GrantsOutcome | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  const [confirming, setConfirming] = useState<GrantView | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** El nombre del último pedido: la fila ya no está cuando llega la respuesta. */
  const target = useRef("");

  const revoke = useAction(revokeGrant, {
    unreachableMessage: mcpMessages.unexpectedRevoke,
    optimistic: (input) => hide(input.clientId),
    onSuccess: () => setOutcome({ kind: "revoked", name: target.current }),
    onFailure: (failure) =>
      setOutcome({
        kind: "failed",
        name: target.current,
        message: failure.message,
        retry: failure.code === "unexpected",
      }),
  });

  function requestRevoke(grant: GrantView): void {
    if (revoke.pending) {
      return;
    }
    setConfirming(grant);
    setConfirmOpen(true);
  }

  function confirmRevoke(): void {
    if (confirming === null || revoke.pending) {
      return;
    }
    target.current = confirming.name;
    setOutcome(null);
    revoke.run({ clientId: confirming.clientId });
  }

  async function copyUrl(): Promise<void> {
    // Vaciar antes: si la región ya dice «Dirección copiada.», el lector no
    // repite el mismo texto al copiar otra vez.
    setCopy("idle");
    try {
      await navigator.clipboard.writeText(view.serverUrl);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <>
      <AssistantGrantsView
        serverUrl={view.serverUrl}
        grants={grants}
        canRevoke={view.canRevoke}
        pending={revoke.pending}
        feedback={feedbackOf(outcome)}
        copy={copy}
        onCopy={() => void copyUrl()}
        onRevoke={requestRevoke}
        onRetry={() => {
          // «Reintentar» se va con su aviso: el foco pasa antes al encabezado,
          // que es adonde lo deja la fila que sale.
          document.getElementById(GRANTS_HEADING_ID)?.focus();
          setOutcome(null);
          revoke.retry();
        }}
      />
      <RevokeGrantDialog
        grant={confirming}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmRevoke}
      />
    </>
  );
}

type AssistantGrantsViewProps = {
  readonly serverUrl: string;
  /** Las que quedan, sin la que se está desconectando. */
  readonly grants: readonly GrantView[];
  readonly canRevoke: boolean;
  readonly pending: boolean;
  readonly feedback: GrantsFeedback | null;
  readonly copy: CopyState;
  readonly onCopy: () => void;
  /** El clic en «Desconectar»: abre la confirmación. */
  readonly onRevoke: (grant: GrantView) => void;
  /** Reenvía el último pedido; se ofrece solo si `feedback.retry`. */
  readonly onRetry: () => void;
};

/** La sección sin estado. */
export function AssistantGrantsView({
  serverUrl,
  grants,
  canRevoke,
  pending,
  feedback,
  copy,
  onCopy,
  onRevoke,
  onRetry,
}: AssistantGrantsViewProps) {
  const urlId = useId();

  return (
    <section
      aria-labelledby={GRANTS_HEADING_ID}
      className="mx-auto flex w-full max-w-2xl flex-col gap-4"
    >
      {/* Con `tabIndex={-1}`: recibe el foco cuando la fila desconectada sale. */}
      <h2
        id={GRANTS_HEADING_ID}
        tabIndex={-1}
        className="focus-visible:ring-ring/50 text-base font-medium outline-none focus-visible:ring-3"
      >
        {grantsLabels.heading}
      </h2>
      <p className="text-muted-foreground text-sm">{grantsLabels.intro}</p>

      <div className="grid gap-2">
        <Label htmlFor={urlId}>{grantsLabels.serverUrl}</Label>
        <div className="flex gap-2">
          <Input
            id={urlId}
            type="text"
            value={serverUrl}
            readOnly
            className="h-9 font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" className="h-9" onClick={onCopy}>
            {copy === "copied" ? grantsLabels.copied : grantsLabels.copy}
          </Button>
        </div>
        <p role="status" className="text-muted-foreground text-sm">
          {copy === "copied"
            ? grantsLabels.copiedStatus
            : copy === "failed"
              ? grantsLabels.copyFailed
              : ""}
        </p>
      </div>

      {feedback !== null && (
        <ActionFeedback
          tone={feedback.tone}
          title={feedback.title}
          message={feedback.message}
          onRetry={feedback.retry ? onRetry : undefined}
        />
      )}

      {grants.length === 0 ? (
        <p className="text-muted-foreground text-sm">{grantsLabels.empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {grants.map((grant) => (
            <li
              key={grant.clientId}
              className="flex items-center justify-between gap-4 px-3 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold break-words">{grant.name}</span>
                <span className="text-muted-foreground text-sm">
                  {grantsLabels.detail(grant.returnsTo, grant.grantedOn)}
                </span>
              </span>
              {canRevoke && (
                <Button
                  id={revokeGrantButtonId(grant.clientId)}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={grantsLabels.revokeName(grant.name)}
                  // Con `aria-disabled` y no con `disabled`: el botón conserva el
                  // foco mientras el pedido viaja, y `onRevoke` no abre la
                  // confirmación con un pedido en curso.
                  aria-disabled={pending || undefined}
                  onClick={() => onRevoke(grant)}
                >
                  {grantsLabels.revoke}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
