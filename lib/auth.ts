import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSesion, listarEmpresas, getEmpresa } from "./repos";
import type { Emisor, Rol, Usuario } from "./types";

export const COOKIE_SESION = "hl_sesion";
export const COOKIE_EMPRESA = "hl_empresa";

/* ---------- Contraseñas (scrypt nativo, sin dependencias) ---------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calculado = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(calculado, Buffer.from(hash, "hex"));
}

/* ---------- Contexto de sesión ---------- */

export interface Ctx {
  usuario: Usuario;
  despachoId: string;
  /** Empresas que este usuario puede ver/operar según su rol */
  empresas: Emisor[];
  empresaActiva: Emisor | null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function empresasPermitidas(usuario: Usuario): Promise<Emisor[]> {
  const todas = await listarEmpresas(usuario.despachoId);
  if (usuario.rol === "admin" || usuario.rol === "supervisor") return todas;
  return todas.filter((e) => usuario.empresaIds.includes(e.id));
}

export async function getCtx(): Promise<Ctx | null> {
  const jar = await cookies();
  const sesionId = jar.get(COOKIE_SESION)?.value;
  if (!sesionId) return null;
  const sesion = await getSesion(sesionId);
  if (!sesion) return null;
  const empresas = await empresasPermitidas(sesion.usuario);
  const empresaCookie = jar.get(COOKIE_EMPRESA)?.value;
  const empresaActiva =
    empresas.find((e) => e.id === empresaCookie) ?? empresas[0] ?? null;
  return { usuario: sesion.usuario, despachoId: sesion.usuario.despachoId, empresas, empresaActiva };
}

/** Exige sesión y, opcionalmente, uno de los roles indicados. */
export async function requireCtx(roles?: Rol[]): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new AuthError("Inicia sesión para continuar.", 401);
  if (roles && !roles.includes(ctx.usuario.rol)) {
    throw new AuthError("Tu rol no tiene permiso para esta acción.", 403);
  }
  return ctx;
}

/** Verifica que el usuario pueda operar la empresa indicada. */
export async function requireEmpresa(ctx: Ctx, empresaId: string): Promise<Emisor> {
  const empresa = ctx.empresas.find((e) => e.id === empresaId);
  if (!empresa) {
    // Verificar si existe pero no está permitida, para no filtrar información
    const existe = await getEmpresa(empresaId);
    throw new AuthError(existe ? "No tienes acceso a esta empresa." : "Empresa no encontrada.", existe ? 403 : 404);
  }
  return empresa;
}

export function authFail(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { ok: false, error: e instanceof Error ? e.message : "Error inesperado" },
    { status: 500 },
  );
}

export const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86_400,
  // En producción detrás de HTTPS, exporta COOKIE_SECURE=1 para que las
  // cookies de sesión solo viajen cifradas.
  secure: process.env.COOKIE_SECURE === "1",
};
