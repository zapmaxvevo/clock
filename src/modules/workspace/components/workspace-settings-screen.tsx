import type { ReactNode } from "react";

import { InactiveMembershipNotice } from "@/components/inactive-membership-notice";
import { NameField } from "@/components/name-field";
import {
  WORKSPACE_NAME_MAX,
  workspaceSettingsMessages,
  type WorkspaceSettingsActions,
  type WorkspaceSettingsView,
} from "@/modules/workspace/schema";

import { DurationFormatField } from "./duration-format-field";
import { workspaceSettingsLabels } from "./labels";

/** Un grupo de ajustes (WS-03): la `<section>` nombrada por su `<h2>`. */
function SettingsSection({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

type WorkspaceSettingsScreenProps = {
  /** Sin `workspace.settings.update`, sin ajustes (D-WS1-5). */
  readonly view: WorkspaceSettingsView;
  /** Las actions llegan por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: WorkspaceSettingsActions;
};

/**
 * `/configuracion`: los ajustes del workspace, una `<section>` con su `<h2>` por
 * grupo (WS-03): «General» con el nombre, que guarda al salir o con Enter, y
 * «Registro de tiempo» con el formato de duración, que guarda al elegir
 * (WS-04). E4 suma un control a «General» (D-WS1-7).
 */
export function WorkspaceSettingsScreen({ view, actions }: WorkspaceSettingsScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-xl font-semibold">{workspaceSettingsLabels.heading}</h1>

      {view.kind === "ready" ? (
        <>
          <SettingsSection
            id="workspace-settings-general"
            title={workspaceSettingsLabels.general}
          >
            <NameField
              save={actions.updateWorkspaceName}
              value={view.name}
              label={workspaceSettingsLabels.name}
              maxLength={WORKSPACE_NAME_MAX}
              autoComplete="organization"
              failureTitle={workspaceSettingsLabels.nameFailed}
              unreachableMessage={workspaceSettingsMessages.unexpected}
            />
          </SettingsSection>
          <SettingsSection
            id="workspace-settings-time-tracking"
            title={workspaceSettingsLabels.timeTracking}
          >
            <DurationFormatField
              value={view.durationFormat}
              save={actions.updateWorkspaceSetting}
            />
          </SettingsSection>
        </>
      ) : view.reason === "inactive" ? (
        <InactiveMembershipNotice body={workspaceSettingsLabels.forbiddenBody} />
      ) : (
        <p>{workspaceSettingsLabels.forbiddenRole}</p>
      )}
    </div>
  );
}
