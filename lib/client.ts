"use client";

// Utilidades del lado del cliente: llamadas al API y formato.

export class ApiError extends Error {
  errores: string[];
  constructor(message: string, errores?: string[]) {
    super(message);
    this.errores = errores ?? [message];
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let json: { ok?: boolean; data?: T; error?: string; errores?: string[] };
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Respuesta inválida del servidor (${res.status})`);
  }
  if (res.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
    // Sesión inválida o expirada. La cookie hl_sesion es httpOnly, así que la
    // limpiamos vía logout antes de ir al login; de lo contrario el middleware
    // rebota /login → / y se genera un bucle de redirección infinito.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
    return new Promise<T>(() => {}); // detiene el flujo mientras se redirige
  }
  if (!res.ok || !json.ok) {
    throw new ApiError(json.error || `Error ${res.status}`, json.errores);
  }
  return json.data as T;
}

export function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return api<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function putJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return api<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
