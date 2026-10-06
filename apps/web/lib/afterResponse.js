/**
 * Runs best-effort work (emails) AFTER the response has gone out, so a slow or failing mailer can never hold up or
 * change what the sender sees. Inside a request Next's `after` keeps the function alive until the work is done and
 * this returns at once; anywhere else (unit tests, scripts) there is no response to wait for, so the work simply
 * runs to completion before this returns. Callers `await` it. Never throws.
 */
export async function afterResponse(work) {
  const run = async () => {
    try {
      await work();
    } catch (error) {
      console.warn("[accounts] background work failed:", error?.message || error);
    }
  };
  try {
    const { after } = await import("next/server");
    after(run);
    return;
  } catch {
    // Not inside a request: run it now.
  }
  await run();
}
