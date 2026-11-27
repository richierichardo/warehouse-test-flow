import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountAccessActions } from "@/components/account-access-actions";
import { AdminPagination } from "@/components/admin-pagination";
import { secondaryClass } from "@/components/operations-styles";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthRuntime } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { parseAdminQuery } from "@/modules/identity-access/admin-schema";
import { listAdminAccounts } from "@/modules/identity-access/admin-service";
import { requireWorkspacePrincipal, roleLabels } from "@/modules/identity-access/workspace";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireWorkspacePrincipal();
  if (!hasPermission(principal.role, "user:read")) redirect("/akses-ditolak");
  const query = parseAdminQuery(await searchParams);
  const result = query.success ? await listAdminAccounts(getAuthRuntime().db, principal, query.data) : null;

  return <WorkspaceShell principal={principal} path="/admin/akun">
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Akun</h1>
      {result ? <>
        {result.data.length ? <ul aria-label="Daftar akun" className="space-y-3">
          {result.data.map((account) => <li key={account.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-card p-4 sm:p-5">
            <div className="min-w-0 space-y-1">
              <h2 className="font-semibold wrap-anywhere">{account.name}</h2>
              <p className="text-sm text-muted-foreground wrap-anywhere">{account.email}</p>
              <p className="text-sm">{roleLabels[account.role]} · {account.isActive ? "Aktif" : "Nonaktif"}</p>
            </div>
            {principal.id === account.id ? <p className="text-sm text-muted-foreground">Akun Anda</p> : <AccountAccessActions account={account} />}
          </li>)}
        </ul> : <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Belum ada akun pada halaman ini.</p>}
        <AdminPagination path="/admin/akun" meta={result.meta} />
      </> : <div role="alert" className="space-y-2 rounded-lg border bg-card p-5 text-sm">
        <p>Nomor halaman tidak valid.</p><Link href="/admin/akun" className={secondaryClass}>Halaman pertama</Link>
      </div>}
    </div>
  </WorkspaceShell>;
}
