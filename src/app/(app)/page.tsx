import { requireSession } from "@/server/session";

const roleLabel: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  project_manager: "Project manager",
  team_manager: "Team manager",
  member: "Usuario",
};

export default async function HomePage() {
  const session = await requireSession();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hola, {session.user.name}</h1>
      <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Workspace</dt>
        <dd>{session.workspace.name}</dd>
        <dt className="text-muted-foreground">Rol</dt>
        <dd>{roleLabel[session.actor.role] ?? session.actor.role}</dd>
        <dt className="text-muted-foreground">Zona horaria</dt>
        <dd>{session.workspace.timezone}</dd>
      </dl>
      <p className="text-muted-foreground text-sm">
        La carga de horas llega en la fase 1.
      </p>
    </div>
  );
}
