import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function failMany(errores: string[], status = 400) {
  return NextResponse.json({ ok: false, error: errores.join("\n"), errores }, { status });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado";
}
