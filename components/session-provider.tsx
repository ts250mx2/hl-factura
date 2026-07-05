"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api, postJson } from "@/lib/client";
import type { Rol } from "@/lib/types";

export interface SesionInfo {
  usuario: { id: string; nombre: string; email: string; rol: Rol };
  despacho: { id: string; nombre: string } | null;
  empresas: { id: string; rfc: string; nombre: string; colorTag: string }[];
  empresaActivaId: string | null;
}

interface SesionCtx {
  sesion: SesionInfo | null;
  cargando: boolean;
  recargar: () => Promise<void>;
  cambiarEmpresa: (empresaId: string) => Promise<void>;
}

const Ctx = createContext<SesionCtx>({
  sesion: null,
  cargando: true,
  recargar: async () => {},
  cambiarEmpresa: async () => {},
});

export function useSesion() {
  return useContext(Ctx);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sesion, setSesion] = useState<SesionInfo | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    try {
      setSesion(await api<SesionInfo>("/api/auth/me"));
    } catch {
      setSesion(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (pathname === "/login") {
      setCargando(false);
      return;
    }
    recargar();
  }, [pathname === "/login", recargar]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarEmpresa = useCallback(
    async (empresaId: string) => {
      await postJson("/api/empresa-activa", { empresaId });
      await recargar();
      // Las páginas leen datos de la empresa activa: recarga limpia
      window.location.reload();
    },
    [recargar],
  );

  return <Ctx.Provider value={{ sesion, cargando, recargar, cambiarEmpresa }}>{children}</Ctx.Provider>;
}
