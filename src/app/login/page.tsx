import { LoginForm } from "@/components/auth-controls";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string | string[] }> }) {
  const { reason } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex min-h-36 flex-col justify-center border-b border-[#28475b] bg-[#172c3d] p-7 text-white sm:p-10 md:min-h-120 md:border-r md:border-b-0">
          <p className="max-w-xs text-2xl leading-tight font-semibold tracking-tight sm:text-3xl md:text-4xl">Gudang Perlengkapan Kantor</p>
        </div>
        <div className="self-center p-7 sm:p-10 lg:p-12">
          <h1 className="text-3xl font-semibold tracking-tight">Masuk</h1>
          {reason === "session-expired" && <p role="status" className="mt-4 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">Sesi Anda telah berakhir. Silakan masuk lagi.</p>}
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
