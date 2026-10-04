import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ProfileActions } from "@/modules/profile/schema";
import type { ProfileView } from "@/modules/profile/service";

import { dayNames, profileLabels } from "./labels";
import { PreferenceField } from "./preference-field";

type ProfileScreenProps = {
  readonly view: ProfileView;
  /** La action llega por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: ProfileActions;
};

/**
 * `/perfil`: la identidad de Google en solo lectura y las preferencias de
 * hora y fecha, que guardan al cambiar (PF-30, PF-31). El primer día de la
 * semana y el formato de duración se muestran y no se editan acá.
 */
export function ProfileScreen({ view, actions }: ProfileScreenProps) {
  const { identity, preferences, options, canEdit } = view;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-xl font-semibold">{profileLabels.title}</h1>

      <section aria-labelledby="profile-identity" className="flex flex-col gap-4">
        <h2 id="profile-identity" className="text-base font-medium">
          {profileLabels.identity}
        </h2>
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            {identity.image !== null && (
              // El nombre está al lado: la foto no repite nada.
              <AvatarImage src={identity.image} alt="" referrerPolicy="no-referrer" />
            )}
            <AvatarFallback aria-hidden="true">{identity.initials}</AvatarFallback>
          </Avatar>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{profileLabels.name}</dt>
            <dd>{identity.name}</dd>
            <dt className="text-muted-foreground">{profileLabels.email}</dt>
            <dd>{identity.email}</dd>
          </dl>
        </div>
        <p className="text-muted-foreground text-sm">{profileLabels.identityNote}</p>
      </section>

      <section aria-labelledby="profile-preferences" className="flex flex-col gap-4">
        <h2 id="profile-preferences" className="text-base font-medium">
          {profileLabels.preferences}
        </h2>

        {!canEdit && (
          <Alert>
            <InfoIcon aria-hidden="true" />
            <AlertTitle>{profileLabels.inactiveTitle}</AlertTitle>
            <AlertDescription>{profileLabels.inactiveMessage}</AlertDescription>
          </Alert>
        )}

        <div
          role="group"
          aria-labelledby="profile-time-and-date"
          className="flex flex-col gap-5 rounded-lg border p-4"
        >
          <h3 id="profile-time-and-date" className="text-sm font-medium">
            {profileLabels.timeAndDate}
          </h3>
          <PreferenceField
            preference="timezone"
            value={view.timezoneOption}
            options={options.timezones}
            canEdit={canEdit}
            updatePreference={actions.updatePreference}
          />
          <PreferenceField
            preference="dateFormat"
            value={preferences.dateFormat}
            options={options.dateFormats}
            canEdit={canEdit}
            updatePreference={actions.updatePreference}
          />
          <PreferenceField
            preference="timeFormat"
            value={preferences.timeFormat}
            options={options.timeFormats}
            canEdit={canEdit}
            updatePreference={actions.updatePreference}
          />
          <FixedSetting
            label={profileLabels.weekStart}
            value={dayNames[view.weekStart]}
            note={profileLabels.weekStartNote}
          />
          <FixedSetting
            label={profileLabels.durationFormat}
            value={profileLabels.durationValue}
            note={profileLabels.durationNote}
          />
        </div>
      </section>
    </div>
  );
}

type FixedSettingProps = {
  readonly label: string;
  readonly value: ReactNode;
  /** Quién lo decide, ya que acá no se cambia (PF-01, PF-02). */
  readonly note: string;
};

/** Un ajuste que se muestra y no se edita en esta pantalla. */
function FixedSetting({ label, value, note }: FixedSettingProps) {
  return (
    <dl className="grid gap-1 text-sm">
      <dt className="font-medium">{label}</dt>
      <dd>{value}</dd>
      <dd className="text-muted-foreground">{note}</dd>
    </dl>
  );
}
