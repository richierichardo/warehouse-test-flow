import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { hasAnyPermission } from "@/lib/permissions";
import { requireWorkspacePrincipal, sectionTitle, workspaceSections } from "@/modules/identity-access/workspace";

export default async function SectionPage({ params }: { params: Promise<{ section: string[] }> }) {
  const path = `/${(await params).section.join("/")}`;
  const section = workspaceSections.find((entry) => entry.path === path);
  if (!section) notFound();

  const principal = await requireWorkspacePrincipal();
  if (!hasAnyPermission(principal.role, section.permissions)) redirect("/akses-ditolak");

  return (
    <WorkspaceShell principal={principal} path={path}>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{sectionTitle(section, principal.role)}</h1>
      <div className="mt-6 rounded-lg border bg-card p-7 text-sm text-muted-foreground">Fitur ini belum tersedia.</div>
    </WorkspaceShell>
  );
}
