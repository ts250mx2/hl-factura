"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  Building2,
  Users,
  Package,
  ShieldCheck,
  CloudDownload,
  Settings,
  Sparkles,
  UserCog,
  LogOut,
  ChevronDown,
  Archive,
  Bell,
  HandCoins,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { useSesion } from "./session-provider";
import type { Rol } from "@/lib/types";

interface Item {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Rol[]; // sin roles = todos
}

const NAV: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/facturas", label: "Facturas", icon: FileText },
  { href: "/pagos", label: "Pagos (REP)", icon: HandCoins },
  { href: "/cxc", label: "Por cobrar", icon: Wallet },
  { href: "/cxp", label: "Por pagar", icon: CalendarClock },
  { href: "/boveda", label: "Bóveda CFDI", icon: Archive },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/emisores", label: "Empresas / RFCs", icon: Building2, roles: ["admin", "supervisor"] },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/productos", label: "Productos", icon: Package },
];

const NAV_SAT: Item[] = [
  { href: "/herramientas/validador", label: "Validador CFDI", icon: ShieldCheck },
  { href: "/herramientas/descarga-masiva", label: "Descarga masiva", icon: CloudDownload },
  { href: "/usuarios", label: "Usuarios", icon: UserCog, roles: ["admin"] },
  { href: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  supervisor: "Contador supervisor",
  auxiliar: "Auxiliar contable",
  cliente: "Cliente",
};

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
        active ? "text-white" : "text-slate-400 hover:text-slate-100"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-600/90 to-violet-600/80 shadow-lg shadow-brand-900/40"
        />
      )}
      <Icon className="relative z-10 size-[18px] shrink-0" />
      <span className="relative z-10">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sesion, cambiarEmpresa } = useSesion();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const rol = sesion?.usuario.rol;
  const visible = (item: Item) => !item.roles || (rol && item.roles.includes(rol));
  const empresaActiva = sesion?.empresas.find((e) => e.id === sesion.empresaActivaId);

  const salir = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-[#0e1022] px-4 py-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      <Link href="/" className="relative mb-5 flex items-center gap-3 px-2">
        <motion.div
          whileHover={{ rotate: -8, scale: 1.05 }}
          className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg shadow-brand-900/50"
        >
          <Sparkles className="size-5 text-white" />
        </motion.div>
        <div>
          <p className="text-base font-extrabold tracking-tight text-white">HL Factura</p>
          <p className="max-w-[9.5rem] truncate text-[11px] font-medium text-slate-400">
            {sesion?.despacho?.nombre ?? "CFDI 4.0 · SAT México"}
          </p>
        </div>
      </Link>

      {/* Selector de empresa (RFC) activa */}
      {sesion && sesion.empresas.length > 0 && (
        <div className="relative mb-4">
          <label className="mb-1 block px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Trabajando en
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full"
              style={{ background: empresaActiva?.colorTag ?? "#6366f1" }}
            />
            <select
              value={sesion.empresaActivaId ?? ""}
              onChange={(e) => cambiarEmpresa(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-8 pr-8 text-xs font-semibold text-slate-100 outline-none transition hover:border-brand-400/40 focus:border-brand-400"
            >
              {sesion.empresas.map((e) => (
                <option key={e.id} value={e.id} className="bg-[#0e1022]">
                  {e.rfc} · {e.nombre}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      )}

      <Link
        href="/facturas/nueva"
        className="relative mb-6 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-900/50 transition hover:brightness-110 active:scale-[0.98]"
      >
        <FilePlus2 className="size-4" />
        Nueva factura
      </Link>

      <nav className="relative flex flex-col gap-1">
        {NAV.filter(visible).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <p className="relative mb-1 mt-6 px-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        SAT · Administración
      </p>
      <nav className="relative flex flex-col gap-1">
        {NAV_SAT.filter(visible).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Usuario */}
      <div className="relative mt-auto pt-6">
        {sesion && (
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-extrabold text-white">
                {sesion.usuario.nombre.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-100">{sesion.usuario.nombre}</p>
                <p className="truncate text-[10px] text-slate-400">{ROL_LABEL[sesion.usuario.rol]}</p>
              </div>
              <button
                onClick={salir}
                title="Cerrar sesión"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-rose-300"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
