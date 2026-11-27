import "server-only";

import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth-controls";
import { hasAnyPermission } from "@/lib/permissions";
import type { Principal } from "@/lib/principal";
import { roleLabels, sectionTitle, workspaceSections } from "@/modules/identity-access/workspace";

export function WorkspaceShell({ principal, path, children }: { principal: Principal; path: string; children: ReactNode }) {
  const sections = workspaceSections.filter(({ permissions }) => hasAnyPermission(principal.role, permissions));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
      <a href="#konten" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2">Lewati ke konten</a>
      <aside className="flex flex-col gap-6 bg-[#172c3d] px-5 py-6 text-white lg:min-h-screen lg:px-6 lg:py-8">
        <Link href="/" prefetch={false} className="w-fit rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-200">Gudang Perlengkapan</Link>
        <nav aria-label="Navigasi ruang kerja" className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {sections.map((section) => (
            <Link key={section.path} href={section.path} prefetch={false} aria-current={path === section.path ? "page" : undefined}
              className="min-w-0 rounded-md px-3 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200 aria-[current=page]:bg-[#225451] aria-[current=page]:text-white">
              {sectionTitle(section, principal.role)}
            </Link>
          ))}
        </nav>
        <div className="grid gap-3 border-t border-white/20 pt-4 sm:grid-cols-2 lg:mt-auto lg:grid-cols-1">
          <div className="min-w-0">
            <p className="wrap-break-word text-sm font-semibold">{principal.name}</p>
            <p className="mt-1 text-sm text-slate-300">{roleLabels[principal.role]}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main id="konten" tabIndex={-1} className="mx-auto w-full max-w-5xl px-5 py-10 outline-none sm:px-8 lg:px-12 lg:py-14">
        {children}
      </main>
    </div>
  );
}
