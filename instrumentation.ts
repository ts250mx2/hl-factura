// Se ejecuta una vez al arrancar el servidor Next.js:
// levanta el scheduler de sincronización nocturna con el SAT.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarScheduler } = await import("./lib/sat/scheduler");
    iniciarScheduler();
  }
}
