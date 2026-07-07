import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import {
  listarFacturas,
  listarClientes,
  listarProductos,
  getConfigPac,
  contarAlertasNoLeidas,
  resumenBoveda,
} from "@/lib/repos";

// Tablero de control: métricas agregadas de las empresas que el usuario puede
// ver, más el panel de cumplimiento por empresa (certificados, actividad).
export async function GET() {
  try {
    const ctx = await requireCtx();
    const ahora = new Date();
    // Las métricas del tablero reflejan la empresa activa ("Trabajando en");
    // el panel de cumplimiento de abajo sí recorre todas las empresas.
    const empresaIds = ctx.empresaActiva ? [ctx.empresaActiva.id] : [];
    const idsTodas = ctx.empresas.map((e) => e.id);
    const facturas = await listarFacturas(empresaIds);
    const todasFacturas = await listarFacturas(idsTodas);
    const vigentes = facturas.filter((f) => f.estado === "timbrada");

    const esDelMes = (iso: string, offset: number) => {
      const d = new Date(iso);
      const ref = new Date(ahora.getFullYear(), ahora.getMonth() - offset, 1);
      return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    };

    const facturadoMes = vigentes.filter((f) => esDelMes(f.creadoEl, 0)).reduce((s, f) => s + f.total, 0);
    const facturadoMesAnterior = vigentes.filter((f) => esDelMes(f.creadoEl, 1)).reduce((s, f) => s + f.total, 0);

    const nombresMes = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const meses: { mes: string; total: number; cantidad: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const delMes = vigentes.filter((f) => esDelMes(f.creadoEl, i));
      meses.push({
        mes: nombresMes[ref.getMonth()],
        total: Math.round(delMes.reduce((s, f) => s + f.total, 0) * 100) / 100,
        cantidad: delMes.length,
      });
    }

    const porCliente = new Map<string, { nombre: string; total: number; cantidad: number }>();
    for (const f of vigentes) {
      const item = porCliente.get(f.receptorRfc) ?? { nombre: f.receptorNombre, total: 0, cantidad: 0 };
      item.total += f.total;
      item.cantidad += 1;
      porCliente.set(f.receptorRfc, item);
    }
    const topClientes = [...porCliente.entries()]
      .map(([rfc, v]) => ({ rfc, ...v, total: Math.round(v.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Panel de cumplimiento por empresa (para despacho: vista maestra)
    const empresas = [];
    for (const e of ctx.empresas) {
      const propias = todasFacturas.filter((f) => f.emisorId === e.id);
      const timbradasEmpresa = propias.filter((f) => f.estado === "timbrada");
      const diasCsd = e.csd
        ? Math.floor((new Date(e.csd.validoHasta).getTime() - ahora.getTime()) / 86_400_000)
        : null;
      const diasFiel = e.fiel
        ? Math.floor((new Date(e.fiel.validoHasta).getTime() - ahora.getTime()) / 86_400_000)
        : null;
      empresas.push({
        id: e.id,
        rfc: e.rfc,
        nombre: e.nombre,
        colorTag: e.colorTag,
        csd: e.csd ? { dias: diasCsd, vence: e.csd.validoHasta } : null,
        fiel: e.fiel ? { dias: diasFiel, vence: e.fiel.validoHasta } : null,
        timbradas: timbradasEmpresa.length,
        conError: propias.filter((f) => f.estado === "error").length,
        facturadoMes:
          Math.round(timbradasEmpresa.filter((f) => esDelMes(f.creadoEl, 0)).reduce((s, f) => s + f.total, 0) * 100) / 100,
        clientes: (await listarClientes(e.id)).length,
      });
    }

    const csdPorVencer = empresas
      .filter((e) => e.csd && e.csd.dias !== null && e.csd.dias < 90)
      .map((e) => ({ emisor: e.nombre, rfc: e.rfc, vence: e.csd!.vence, dias: e.csd!.dias! }));

    return ok({
      rol: ctx.usuario.rol,
      totales: {
        emisores: ctx.empresas.length,
        clientes: ctx.empresaActiva ? (await listarClientes(ctx.empresaActiva.id)).length : 0,
        productos: ctx.empresaActiva ? (await listarProductos(ctx.empresaActiva.id)).length : 0,
        facturas: facturas.length,
        timbradas: vigentes.length,
        canceladas: facturas.filter((f) => f.estado === "cancelada").length,
        conError: facturas.filter((f) => f.estado === "error").length,
        facturadoMes: Math.round(facturadoMes * 100) / 100,
        facturadoMesAnterior: Math.round(facturadoMesAnterior * 100) / 100,
      },
      meses,
      topClientes,
      csdPorVencer,
      empresas,
      recientes: facturas.slice(0, 6),
      modoPac: (await getConfigPac(ctx.despachoId)).modo,
      alertasNoLeidas: await contarAlertasNoLeidas(ctx.despachoId, empresaIds),
      boveda: await resumenBoveda(empresaIds),
    });
  } catch (e) {
    return authFail(e);
  }
}
