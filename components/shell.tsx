"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { SessionProvider } from "./session-provider";
import { ToastProvider } from "./toast";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esLogin = pathname === "/login";

  return (
    <ToastProvider>
      <SessionProvider>
        {esLogin ? (
          children
        ) : (
          <>
            <Sidebar />
            <main className="min-h-screen pl-64 print:pl-0">
              <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
            </main>
          </>
        )}
      </SessionProvider>
    </ToastProvider>
  );
}
