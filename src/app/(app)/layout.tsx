import { AppNav } from "@/components/layout/app-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { requireSession } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">{session.workspace.name}</span>
          <AppNav />
        </div>
        <UserMenu name={session.user.name} email={session.user.email} />
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
