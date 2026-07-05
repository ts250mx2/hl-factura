import { NextResponse, type NextRequest } from "next/server";

// Protección de páginas: sin cookie de sesión → /login.
// La validación real de la sesión ocurre en cada API route (aquí solo se
// verifica presencia de la cookie, el middleware corre en Edge sin acceso a la BD).

const RUTAS_PUBLICAS = ["/login", "/api/auth/login", "/api/auth/setup", "/api/auth/estado"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const tieneSesion = Boolean(req.cookies.get("hl_sesion")?.value);

  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (pathname === "/login" && tieneSesion) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!tieneSesion) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Inicia sesión para continuar." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
