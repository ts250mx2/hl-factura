import { ok, fail, errorMessage } from "@/lib/api-helpers";
import { contarUsuarios } from "@/lib/repos";

// La consulta va a MySQL: nunca prerenderizar esta ruta en el build
export const dynamic = "force-dynamic";

// Indica si el sistema necesita el registro inicial del despacho.
export async function GET() {
  try {
    return ok({ requiereSetup: (await contarUsuarios()) === 0 });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
