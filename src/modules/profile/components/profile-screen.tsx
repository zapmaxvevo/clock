import { InactiveMembershipNotice } from "@/components/inactive-membership-notice";
import { NameField } from "@/components/name-field";
import { NAME_MAX, profileMessages, type ProfileActions } from "@/modules/profile/schema";
import type { ProfileView } from "@/modules/profile/service";
import { durationFormatText } from "@/modules/workspace/components/labels";

import { dayNames, failureTitles, profileLabels } from "./labels";
import { FixedSetting, PreferenceField } from "./preference-field";
import { UserAvatar } from "./user-avatar";

type ProfileScreenProps = {
  readonly view: ProfileView;
  /** Las actions llegan por props desde `page.tsx`, el único que importa `actions.ts`. */
  readonly actions: ProfileActions;
};

/**
 * `/perfil`: el nombre editable con la foto y el correo de Google, y las
 * preferencias de hora y fecha y de apariencia, que guardan al cambiar (PF-07,
 * PF-30, PF-31). El primer día de la semana y el formato de duración se
 * muestran y no se editan acá.
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
        <div className="flex items-start gap-4">
          <UserAvatar image={identity.image} initials={identity.initials} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <NameField
              save={actions.updateName}
              value={identity.name}
              label={profileLabels.name}
              maxLength={NAME_MAX}
              autoComplete="name"
              failureTitle={failureTitles.name}
              unreachableMessage={profileMessages.unexpected}
              readOnly={!canEdit}
            />
            <FixedSetting label={profileLabels.email} value={identity.email} />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{profileLabels.identityNote}</p>
      </section>

      <section aria-labelledby="profile-preferences" className="flex flex-col gap-4">
        <h2 id="profile-preferences" className="text-base font-medium">
          {profileLabels.preferences}
        </h2>

        {!canEdit && <InactiveMembershipNotice body={profileLabels.inactiveMessage} />}

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
            value={durationFormatText(view.durationFormat)}
            note={profileLabels.durationNote}
          />
        </div>

        <div
          role="group"
          aria-labelledby="profile-appearance"
          className="flex flex-col gap-5 rounded-lg border p-4"
        >
          <h3 id="profile-appearance" className="text-sm font-medium">
            {profileLabels.appearance}
          </h3>
          <PreferenceField
            preference="theme"
            value={preferences.theme}
            options={options.themes}
            canEdit={canEdit}
            updatePreference={actions.updatePreference}
          />
        </div>
      </section>
    </div>
  );
}
