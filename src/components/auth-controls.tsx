"use client";

import { useEffect, useState, type SubmitEvent } from "react";

function useAuthSubmit(path: string, destination: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryUntil, setRetryUntil] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (!retryUntil) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1_000));
      setRetrySeconds(remaining);
      if (remaining === 0) {
        setRetryUntil(0);
        setError("");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  async function submit(body?: { email: string; password: string }) {
    if (pending || retrySeconds > 0) return;
    setError("");
    setPending(true);

    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        window.location.replace(destination);
        return;
      }
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after"));
        const wait = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1;
        setRetrySeconds(wait);
        setRetryUntil(Date.now() + wait * 1_000);
      } else if (body && response.status === 401) {
        setError("Email atau password salah.");
      } else if (body && response.status === 422) {
        setError("Periksa alamat email dan password Anda.");
      } else {
        setError("Layanan autentikasi sementara tidak tersedia. Coba lagi.");
      }
    } catch {
      setError("Koneksi terputus. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return { submit, pending, error, retrySeconds, disabled: pending || retrySeconds > 0 };
}

const inputClass = "h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

export function LoginForm() {
  const { submit, pending, error, retrySeconds, disabled } = useAuthSubmit("/api/auth/sign-in/email", "/");

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
  }

  return (
    <form method="post" action="/api/auth/sign-in/email" onSubmit={handleSubmit} className="mt-7 space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass} />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} className={inputClass} />
      </div>
      {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
      {retrySeconds > 0 && <p className="text-sm text-amber-900" role="status">Coba lagi dalam {retrySeconds} detik.</p>}
      <button type="submit" disabled={disabled} className="h-12 w-full rounded-md bg-[#136760] px-4 text-sm font-semibold text-white hover:bg-[#0e514c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Sedang masuk…" : "Masuk"}
      </button>
    </form>
  );
}

export function LogoutButton() {
  const { submit, pending, error, retrySeconds, disabled } = useAuthSubmit("/api/auth/sign-out", "/login");

  return (
    <div className="space-y-2">
      <button type="button" disabled={disabled} onClick={() => void submit()} className="w-full rounded-md border border-white/30 px-4 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Sedang keluar…" : "Keluar"}
      </button>
      {error && <p className="text-sm text-red-100" role="alert">{error}</p>}
      {retrySeconds > 0 && <p className="text-sm text-amber-100" role="status">Coba lagi dalam {retrySeconds} detik.</p>}
    </div>
  );
}
