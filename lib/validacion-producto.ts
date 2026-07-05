export function validarProducto(body: Record<string, unknown>) {
  const errores: string[] = [];
  const claveProdServ = String(body.claveProdServ || "").trim();
  const claveUnidad = String(body.claveUnidad || "").trim().toUpperCase();
  const descripcion = String(body.descripcion || "").trim();
  const valorUnitario = Number(body.valorUnitario);
  const objetoImp = String(body.objetoImp || "02");
  const imp = (body.impuestos ?? {}) as Record<string, unknown>;

  if (!/^\d{8}$/.test(claveProdServ)) errores.push("La clave de producto/servicio del SAT debe tener 8 dígitos.");
  if (!claveUnidad) errores.push("La clave de unidad es obligatoria (ej. H87, E48).");
  if (!descripcion) errores.push("La descripción es obligatoria.");
  if (!Number.isFinite(valorUnitario) || valorUnitario < 0) errores.push("El precio unitario debe ser un número mayor o igual a cero.");
  if (!["01", "02", "03", "04", "05"].includes(objetoImp)) errores.push("Objeto de impuesto inválido.");

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "" || v === false) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const datos = {
    claveProdServ,
    claveUnidad,
    unidad: String(body.unidad || "").trim() || undefined,
    noIdentificacion: String(body.noIdentificacion || "").trim() || undefined,
    descripcion,
    valorUnitario,
    objetoImp,
    impuestos: {
      ivaTasa: num(imp.ivaTasa),
      ivaExento: Boolean(imp.ivaExento),
      retIvaTasa: num(imp.retIvaTasa),
      retIsrTasa: num(imp.retIsrTasa),
      iepsTasa: num(imp.iepsTasa),
    },
  };
  return { errores, datos };
}
