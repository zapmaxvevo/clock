import { updateName, updatePreference } from "@/modules/profile/actions";
import { ProfileScreen } from "@/modules/profile/components/profile-screen";
import { getProfileView } from "@/modules/profile/service";
import { requireSession } from "@/server/session";

export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <ProfileScreen
      view={getProfileView(session, session.user)}
      actions={{ updatePreference, updateName }}
    />
  );
}
