import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookie } from "better-auth/cookies";
import { hasPermission, type RequiredPermissions } from "@/lib/permissions";
import { PrincipalRequiredError, requirePrincipal, type Principal } from "@/lib/principal";

export type WorkspaceSection = {
  path: string;
  title: string;
  permissions: RequiredPermissions;
};

export const workspaceSections: readonly WorkspaceSection[] = [
  { path: "/katalog", title: "Katalog", permissions: ["catalog:read"] },
  { path: "/penerimaan", title: "Penerimaan", permissions: ["receipt:read"] },
  { path: "/permintaan", title: "Permintaan", permissions: ["request:read-own", "request:read-all"] },
  { path: "/kartu-stok", title: "Kartu Stok", permissions: ["movement:read"] },
  { path: "/admin/akun", title: "Akun", permissions: ["user:read"] },
  { path: "/admin/audit", title: "Audit", permissions: ["user:read"] },
];

export const roleLabels: Record<Principal["role"], string> = {
  EMPLOYEE: "Karyawan",
  WAREHOUSE: "Petugas Gudang",
  SUPERADMIN: "Superadmin",
};

export function sectionTitle(section: WorkspaceSection, role: Principal["role"]) {
  if (section.path === "/permintaan" && hasPermission(role, "request:read-own")) return "Permintaan Saya";
  return section.title;
}

export async function requireWorkspacePrincipal(): Promise<Principal> {
  const incoming = await headers();
  try {
    return await requirePrincipal(incoming);
  } catch (error) {
    if (!(error instanceof PrincipalRequiredError)) throw error;
    redirect(getSessionCookie(incoming) ? "/login?reason=session-expired" : "/login");
  }
}
