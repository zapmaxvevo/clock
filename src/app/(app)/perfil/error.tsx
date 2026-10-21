"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { profileLabels } from "@/modules/profile/components/labels";

/** La lectura falló. Nunca un perfil a medias. `retry` vuelve a pedir el segmento al servidor. */
export default function ProfilePageError({ retry }: { readonly retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{profileLabels.title}</h1>
      <ActionFeedback title={profileLabels.loadFailed} onRetry={() => retry()} />
    </div>
  );
}
