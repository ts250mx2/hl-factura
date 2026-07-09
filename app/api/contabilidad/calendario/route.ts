import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
// requireEmpresa: valida acceso y permite ?emisorId= para cambiar de empresa.
import { getConfigFiscal, obligacionesPresentadas, marcarObligacion, desmarcarObligacion } from "@/lib/contabilidad/repos";
import { obligacionesDeEmpresa, type EmpresaCalendario } from "@/lib/contabilidad/calendario";

// Calendario de obligaciones fiscales del despacho: tablero mensual con todas las
// empresas visibles y el estado de cada declaración (presentado/pendiente/vencido).
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    const url = new URL(req.url);
    const anio = Number(url.searchParams.get("anio"));
    const mes = Number(url.searchParams.get("mes"));
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return fail("Periodo inválido.");
    }
    const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
    // Solo la empresa activa ("Trabajando en"); ?emisorId= la cambia.
    const emisorId = url.searchParams.get("emisorId");
    let objetivo = ctx.empresaActiva ? [ctx.empresaActiva] : [];
    if (emisorId) objetivo = [await requireEmpresa(ctx, emisorId)];

    const ids = objetivo.map((e) => e.id);
    const presentadas = await obligacionesPresentadas(ids, periodo);

    const empresas: EmpresaCalendario[] = [];
    for (const empresa of objetivo) {
      const perfil = (await getConfigFiscal(empresa.id)).perfil;
      const marcasEmpresa = new Map<string, { presentadoEl: string; nota?: string }>();
      for (const [k, v] of presentadas) {
        if (k.startsWith(`${empresa.id}|`)) marcasEmpresa.set(k.slice(empresa.id.length + 1), v);
      }
      empresas.push(obligacionesDeEmpresa(empresa, perfil, anio, mes, marcasEmpresa));
    }

    const resumen = { total: 0, pendiente: 0, por_vencer: 0, vencido: 0, presentado: 0, empresasConVencidas: 0 };
    for (const e of empresas) {
      let tieneVencida = false;
      for (const o of e.obligaciones) {
        resumen.total++;
        resumen[o.estado]++;
        if (o.estado === "vencido") tieneVencida = true;
      }
      if (tieneVencida) resumen.empresasConVencidas++;
    }

    return ok({ periodo, empresas, resumen });
  } catch (e) {
    return authFail(e);
  }
}

// Marca o desmarca una obligación como presentada.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    const body = (await req.json()) as {
      empresaId?: string;
      clave?: string;
      periodo?: string;
      presentado?: boolean;
      nota?: string;
    };
    const empresaId = String(body.empresaId || "");
    const clave = String(body.clave || "");
    const periodo = String(body.periodo || "");
    if (!empresaId || !clave || !/^\d{4}-\d{2}$/.test(periodo)) return fail("Datos incompletos.");
    await requireEmpresa(ctx, empresaId); // valida acceso a la empresa

    if (body.presentado) {
      await marcarObligacion(empresaId, clave, periodo, new Date().toISOString(), body.nota?.slice(0, 300));
    } else {
      await desmarcarObligacion(empresaId, clave, periodo);
    }
    return ok({ ok: true });
  } catch (e) {
    return authFail(e);
  }
}
