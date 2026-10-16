"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction, type ActionFailure } from "@/hooks/use-action";
import {
  invitationMessages,
  type InvitationActions,
  type InvitationErrorCode,
  type InviteOutcome,
} from "@/modules/workspace/schema";
import type { Rejection } from "@/server/errors";

import { checkEmails, withoutRejected } from "./invite-model";
import { teamLabels } from "./labels";

type InviteDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Adónde vuelve el foco al cerrar: el «Invitar» que lo abrió. */
  readonly finalFocus: () => HTMLElement | null;
  /** `BETTER_AUTH_URL`, para el aviso (D-E1a-10). */
  readonly appUrl: string;
  readonly inviteMembers: InvitationActions["inviteMembers"];
};

/**
 * §5.3: el paso de carga y, con éxito, el de resultado. La pantalla lo monta
 * con una clave nueva en cada apertura: arranca vacío y en el paso de carga.
 */
export function InviteDialog({
  open,
  onOpenChange,
  finalFocus,
  appUrl,
  inviteMembers,
}: InviteDialogProps) {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<readonly InviteOutcome[] | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const invite = useAction(inviteMembers, {
    unreachableMessage: invitationMessages.unexpectedInvite,
    onSuccess: (data) => setOutcomes(data.outcomes),
  });

  function handleOpenChange(next: boolean): void {
    // Con el pedido en vuelo no se cierra: el resultado llegaría a un diálogo
    // cerrado y la persona no vería los avisos para copiar.
    if (!next && invite.pending) {
      return;
    }
    onOpenChange(next);
  }

  function submit(): void {
    if (invite.pending) {
      return;
    }
    const check = checkEmails(text);
    if (!check.ok) {
      setFieldError(check.message);
      fieldRef.current?.focus();
      return;
    }
    setFieldError(null);
    invite.run({ emails: [...check.emails] });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        finalFocus={finalFocus}
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        {outcomes === null ? (
          <InviteForm
            text={text}
            onTextChange={setText}
            fieldError={fieldError}
            failure={invite.failure}
            pending={invite.pending}
            onSubmit={submit}
            onDropRejected={(rejections) => {
              setText(withoutRejected(text, rejections));
              invite.clear();
              fieldRef.current?.focus();
            }}
            onRetry={() => {
              // «Reintentar» se va con su aviso: el foco pasa antes a «Invitar».
              submitRef.current?.focus();
              invite.retry();
            }}
            fieldRef={fieldRef}
            submitRef={submitRef}
          />
        ) : (
          <InviteResult outcomes={outcomes} appUrl={appUrl} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type InviteFormProps = {
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  /** EQ-77 o EQ-78, sin mandar. */
  readonly fieldError: string | null;
  readonly failure: ActionFailure<InvitationErrorCode> | null;
  readonly pending: boolean;
  readonly onSubmit: () => void;
  /** «Quitar los que fallan», con los rechazos del último pedido. */
  readonly onDropRejected: (rejections: readonly Rejection<string>[]) => void;
  readonly onRetry: () => void;
  readonly fieldRef?: Ref<HTMLTextAreaElement>;
  readonly submitRef?: Ref<HTMLButtonElement>;
};

/** El paso de carga, sin estado. Va dentro de un `Dialog`. */
export function InviteForm({
  text,
  onTextChange,
  fieldError,
  failure,
  pending,
  onSubmit,
  onDropRejected,
  onRetry,
  fieldRef,
  submitRef,
}: InviteFormProps) {
  const fieldId = useId();
  const helpId = useId();
  const errorId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{teamLabels.inviteTitle}</DialogTitle>
      </DialogHeader>
      {failure === null ? null : (
        <ActionFeedback
          title={failure.message}
          onRetry={failure.code === "unexpected" ? onRetry : undefined}
        >
          {failure.rejections === undefined ||
          failure.rejections.length === 0 ? undefined : (
            <RejectionList rejections={failure.rejections} onDrop={onDropRejected} />
          )}
        </ActionFeedback>
      )}
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{teamLabels.emailsField}</Label>
        <Textarea
          id={fieldId}
          ref={fieldRef}
          rows={4}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          aria-describedby={fieldError === null ? helpId : `${helpId} ${errorId}`}
          aria-invalid={fieldError !== null || undefined}
        />
        <p id={helpId} className="text-muted-foreground text-sm">
          {teamLabels.emailsHelp}
        </p>
        {fieldError === null ? null : (
          <p id={errorId} role="alert" className="text-destructive text-sm">
            {fieldError}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose
          render={<Button type="button" variant="outline" />}
          aria-disabled={pending || undefined}
        >
          {teamLabels.cancel}
        </DialogClose>
        {/* Con `aria-disabled` y no `disabled`: conserva el foco mientras viaja. */}
        <Button ref={submitRef} type="submit" aria-disabled={pending || undefined}>
          {pending ? teamLabels.inviting : teamLabels.invite}
        </Button>
      </DialogFooter>
    </form>
  );
}

type RejectionListProps = {
  readonly rejections: readonly Rejection<string>[];
  readonly onDrop: (rejections: readonly Rejection<string>[]) => void;
};

/** ADR 0011: cada correo que frenó el pedido, con su causa, que ya lo nombra. */
function RejectionList({ rejections, onDrop }: RejectionListProps) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="list-disc pl-4">
        {rejections.map((rejection) => (
          <li key={rejection.id}>{rejection.message}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onDrop(rejections)}
      >
        {teamLabels.dropRejected}
      </Button>
    </div>
  );
}

type InviteResultProps = {
  readonly outcomes: readonly InviteOutcome[];
  readonly appUrl: string;
};

/**
 * El paso de resultado (D-E1a-10): Clock no manda correo, así que cada correo
 * que puede entrar trae el aviso para copiar. Va dentro de un `Dialog`.
 */
export function InviteResult({ outcomes, appUrl }: InviteResultProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);

  // El botón que mandó el pedido ya no está: el foco pasa al título del paso.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function copy(notice: string): Promise<void> {
    // Vaciar antes: si la región ya dice «Aviso copiado.», el lector no repite
    // el mismo texto al copiar otro aviso.
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(notice);
      setCopyStatus(teamLabels.copied);
    } catch {
      setCopyStatus(teamLabels.copyFailed);
    }
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
          {teamLabels.resultTitle}
        </DialogTitle>
        <DialogDescription>{teamLabels.resultIntro}</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-3">
        {outcomes.map((outcome) => {
          const notice = teamLabels.notice(appUrl, outcome.email);
          return (
            <li key={outcome.email} className="grid gap-2 rounded-lg border p-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-all">{outcome.email}</span>
                {outcome.external && (
                  <Badge variant="secondary">{teamLabels.externalMark}</Badge>
                )}
                <span className="text-muted-foreground">
                  {teamLabels.outcomes[outcome.result]}
                </span>
              </span>
              {outcome.result === "already_member" ? null : (
                <span className="flex items-start justify-between gap-2">
                  <span className="select-all">{notice}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={teamLabels.copyName(outcome.email)}
                    onClick={() => void copy(notice)}
                  >
                    {teamLabels.copy}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p role="status" className="text-muted-foreground text-sm">
        {copyStatus}
      </p>
      <DialogFooter>
        <DialogClose render={<Button type="button" />}>{teamLabels.done}</DialogClose>
      </DialogFooter>
    </div>
  );
}
