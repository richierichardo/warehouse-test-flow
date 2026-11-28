import { WorkspaceShell } from "@/components/workspace-shell";
import { requireWorkspacePrincipal } from "@/modules/identity-access/workspace";

export default async function WorkspaceHome() {
  const principal = await requireWorkspacePrincipal();
  return (
    <WorkspaceShell principal={principal} path="/ruang-kerja">
      <section className="rounded-2xl border bg-card p-7 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Gudang Perlengkapan Kantor</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">Pilih menu untuk membuka area kerja yang tersedia untuk akun Anda.</p>
      </section>
    </WorkspaceShell>
  );
}
