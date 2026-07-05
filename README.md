# HL Factura · Plataforma de Facturación CFDI 4.0 multi-despacho

Portal de facturación electrónica para México construido con **Next.js 15 + TypeScript + Tailwind 4 + Framer Motion + MySQL**. Pensado para despachos contables: un despacho administra múltiples RFCs (empresas) con datos aislados, usuarios con roles y toda la lógica fiscal implementada en `lib/sat/`.

## Configuración

La conexión a MySQL se define en `.env` (copia `.env.example`):

```env
DB_HOST=74.208.192.90
DB_PORT=3306
DB_USER=kyk
DB_PASSWORD=********
DB_NAME=HLPortalContable
```

El esquema (tablas `despachos`, `usuarios`, `empresas`, `clientes`, `productos`, `facturas`, `descargas`, `sesiones`, `config_despacho`) se crea automáticamente en el primer arranque.

## Arranque

```bash
npm install
npm run dev        # http://localhost:3000
```

Producción: `npm run build && npm start`. En el primer arranque, la pantalla de login te pedirá **crear el despacho** y tu cuenta de administrador. Si existía un `data/db.json` de la versión mono-usuario, sus datos se migran automáticamente a MySQL.

## Multi-despacho y roles

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Todo: empresas (RFCs), usuarios, configuración del PAC. |
| **Contador supervisor** | Opera todas las empresas del despacho (facturar, cancelar, descargas, certificados). |
| **Auxiliar contable** | Solo las empresas que se le asignen. |
| **Cliente final** | Solo su(s) propia(s) empresa(s): factura y consulta su operación. |

- Cada empresa (RFC) tiene **sus propios clientes, productos, facturas y descargas** (aislados por `empresaId` en SQLite).
- Selector "Trabajando en…" en la barra lateral para cambiar de RFC.
- Dashboard con **panel maestro de cumplimiento**: estado de CSD/FIEL, facturación y errores por empresa.
- Sesiones con cookie httpOnly + scrypt para contraseñas; llaves privadas cifradas AES-256-GCM.

## Funciones SAT

| Función | Cómo |
|---|---|
| **Certificados CSD y FIEL** | Sube `.cer` + `.key` + contraseña. Se valida: contraseña, correspondencia criptográfica cer↔key, RFC vs empresa, vigencia y tipo (distingue CSD de FIEL por key usage). |
| **Emisión CFDI 4.0** | XML del Anexo 20, cadena original según el XSLT oficial 4.0, sello SHA-256/RSA, IVA 16/8/0/exento, retenciones ISR/IVA, descuentos, factura global, moneda extranjera. |
| **Timbrado** | Modo **demo** (timbre simulado sin validez, para probar) o **SW Sapien** (sandbox gratuito o producción). |
| **Estatus SAT** | Consulta en vivo al servicio público ConsultaCFDIService (Vigente/Cancelado, EFOS). |
| **Cancelación** | Motivos 01–04 + folio de sustitución, vía PAC. |
| **Descarga masiva** | Web service oficial del SAT autenticado con la FIEL: solicitar → verificar → descargar → explorar. |
| **Validador CFDI** | Reconstruye la cadena original de cualquier XML y verifica su sello criptográficamente. |
| **Representación impresa** | Imprimible a PDF con QR de verificación del SAT y total en letra. |

## Estructura

```
lib/sat/          Lógica fiscal: certificados, cadena original, XML, timbrado,
                  estatus, descarga masiva, validador, catálogos, RFC
lib/sql.ts        Pool MySQL (mysql2) + esquema + migración del formato anterior
lib/repos.ts      Repositorios con aislamiento por despacho/empresa
lib/auth.ts       Sesiones, roles y permisos por empresa
app/api/          API REST protegida (auth + tenancy en cada ruta)
app/              Interfaz (login, dashboard maestro, wizard de factura, usuarios…)
data/             Certificados y XMLs en disco (no versionar)
.env              Conexión a MySQL (no versionar)
```

## Certificados de prueba

Usa los CSD/FIEL de prueba del SAT (EKU9003173C9 "ESCUELA KEMPER URGATE", contraseña `12345678a`, repos de nodecfdi/phpcfdi). Están vencidos: funcionan solo en modo demo.

## Motor SAT automatizado (Fase 2)

| Función | Cómo |
|---|---|
| **Bóveda CFDI** | Repositorio central de comprobantes: llegan por descarga masiva (manual o automática) o importación de XMLs. Filtros por tipo, estatus y problema fiscal. |
| **Sincronización nocturna** | Scheduler integrado al servidor (`instrumentation.ts`): a la hora configurada presenta solicitudes de emitidas/recibidas/metadata por cada empresa con FIEL; cada 10 min verifica, descarga e ingesta los paquetes listos. |
| **Monitoreo EFOS 69-B** | Descarga el listado completo del SAT (~14 mil RFCs), lo cruza contra los CFDI recibidos y **bloquea para deducción** los de proveedores «Presunto»/«Definitivo» con alerta crítica. Se refresca cada noche. |
| **Validación de deducción** | CFDI recibido > $2,000 pagado en efectivo (forma 01) → marcado **No deducible** (Art. 27 LISR) con alerta. |
| **Conciliador de metadata** | Cruza el estatus del SAT contra la bóveda: si un proveedor cancela un CFDI que ya tenías registrado, se detecta y alerta al instante. |
| **Centro de alertas** | EFOS, cancelaciones, no deducibles y resultados de sincronización, con severidades y control de leídas. |

La sincronización y la lista EFOS se administran en **Configuración** (solo admin); todo también puede dispararse manualmente («Sincronizar ahora», «Actualizar lista»).

## Operación: REP 2.0, cobranza y pagos (Fase 3)

| Función | Cómo |
|---|---|
| **Complementos de pago (REP 2.0)** | CFDI tipo P con `pago20:Pagos`: parcialidades, saldos, impuestos prorrateados por documento (ImpuestosDR), agregados del pago (ImpuestosP) y nodo Totales. Cadena original extendida con la secuencia del XSLT de Pagos 2.0, sellado con CSD y timbrado (demo o PAC). |
| **Cuentas por cobrar** | Cartera de facturas PPD con saldo (se actualiza sola con cada REP timbrado), antigüedad por buckets (al corriente, por vencer, 1–30, 31–60, +60) y días de crédito configurables por factura. |
| **Recordatorios de cobranza** | Correo con plantilla profesional vía SMTP configurable (manual desde CXC o automático nocturno para vencidas, activable en Configuración). |
| **Cuentas por pagar** | Los CFDI recibidos de la bóveda alimentan el panel CXP con su blindaje fiscal visible (EFOS, no deducible, cancelado); programa fechas de pago o márcalos pagados con nota. |

## Contabilidad automatizada (Fase 4)

| Función | Cómo |
|---|---|
| **Pólizas automáticas** | Un clic contabiliza el mes: facturas emitidas (PUE→bancos/caja, PPD→clientes con IVA pendiente), cobros REP (con reclasificación de IVA), gastos de la bóveda (reglas por RFC/clave de producto; no deducibles a su cuenta) y depreciación mensual de activos. Todas cuadradas o no se registran. |
| **Catálogo de cuentas** | Semilla editable con código agrupador SAT; reglas contables para dirigir proveedores a cuentas específicas. |
| **Contabilidad electrónica** | Balanza de comprobación mensual con saldos acumulados + exportación XML del Anexo 24 (CatalogoCuentas 1.3 y BalanzaComprobacion 1.3, nomenclatura RFC+AAAAMM+CT/BN). |
| **Panel fiscal** | ISR RESICO PF (tabla Art. 113-E por flujo cobrado, retenciones acreditables) o pago provisional PM (coeficiente de utilidad), más IVA del mes (cobrado vs acreditable pagado). |
| **Activos fijos** | Alta con tasas LISR; su depreciación entra sola a las pólizas de diario. |

## Nómina (Fase 5)

| Función | Cómo |
|---|---|
| **Empleados** | Alta con datos SAT (RFC/CURP) e IMSS (NSS, salario diario); SDI y SBC se calculan solos (factor de integración con vacaciones dignas LFT). |
| **Motor de cálculo** | ISR con tarifa mensual Art. 96 prorrateada a los días del periodo, subsidio al empleo (monto y tope configurables por año), cuotas IMSS obrero desglosadas por ramo, costo patronal estimado (IMSS + INFONAVIT 5%). |
| **Incidencias** | Por corrida: faltas, horas extra (exento 50% tope 5 UMA/semana), incapacidades, aguinaldo (exento 30 UMA), prima vacacional (exento 15 UMA), bonos y otras deducciones. |
| **CFDI Nómina 1.2** | Comprobante tipo N + complemento nomina12 completo (receptor laboral, percepciones/deducciones/otros pagos, subsidio causado, incapacidades) con cadena original y sellado CSD. |
| **Timbrado masivo** | Toda la corrida en un clic, con dedup por periodo (no duplica recibos ya timbrados), envío de XML por correo a cada trabajador y export CSV para SUA/IDSE. |

Los parámetros del año (UMA, subsidio, prima de riesgo, registro patronal, entidad) se administran en Nómina → Configuración.

## Conciliación bancaria

Sube el estado de cuenta (CSV/TXT de cualquier banco — el parser detecta delimitador, columnas
de fecha/cargo/abono/concepto, símbolos de moneda y formatos de fecha). Los **depósitos** se
emparejan contra la cartera PPD por monto exacto (saldo o total) y por referencia (folio o nombre
del cliente). Al confirmar un match se **genera y timbra el REP automáticamente** con la fecha real
del depósito. Cada movimiento aplicado queda registrado (hash) y no se vuelve a ofrecer al re-subir
el mismo estado de cuenta.

## Pendientes menores

- Factura global desde notas de venta, gestor de archivos del cliente, registro por invitación.

## Despliegue a producción (Ubuntu)

Todo lo necesario está en `deploy/`:

```powershell
# Desde esta carpeta en Windows (requiere ssh/scp, incluidos en Windows 10/11):
.\deploy\deploy.ps1 -Servidor usuario@74.208.192.90
```

La primera vez el script instala en el servidor: Node 22 LTS, la app en `/opt/hl-factura`
(usuario de servicio dedicado), el servicio **systemd** `hl-factura` (arranque automático,
reinicio ante fallos, scheduler nocturno incluido) y **Caddy** como proxy HTTPS.
Despliegues posteriores solo suben el código, reconstruyen y reinician.

Después del primer despliegue:
1. Edita `/etc/caddy/Caddyfile` con tu dominio (o el bloque de IP con `tls internal`) y `systemctl reload caddy`.
2. En el servidor la app usa `DB_HOST=127.0.0.1`; cierra MySQL al exterior:
   `ufw allow 22,80,443/tcp && ufw deny 3306/tcp && ufw enable`.
3. Las cookies viajan con `Secure` (variable `COOKIE_SECURE=1` ya puesta en el servicio).

## Notas

- El timbrado real solo puede hacerlo un PAC autorizado; el SAT no timbra directo.
- Los XMLs y archivos de certificados se guardan en `data/` del servidor donde corre la app; la información estructurada vive en MySQL.
- Para reiniciar desde cero, vacía las tablas de la base `HLPortalContable` y borra la carpeta `data/`.
