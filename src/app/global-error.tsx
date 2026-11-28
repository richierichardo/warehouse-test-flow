"use client";

import { ErrorRecovery } from "@/components/error-recovery";
import "./globals.css";

export default function GlobalError() {
  return (
    <html lang="id">
      <body><ErrorRecovery /></body>
    </html>
  );
}
