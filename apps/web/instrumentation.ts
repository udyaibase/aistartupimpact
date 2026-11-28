import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Say loudly, once per server start, when a signing secret is missing (see lib/jwt-secret.ts).
    const { missingSecrets } = await import("./lib/jwt-secret");
    const missing = missingSecrets();
    if (missing.length && process.env.NODE_ENV === "production") {
      const message = `[security] Missing signing secrets: ${missing.join(", ")}`;
      console.error(message);
      Sentry.captureMessage(message, "error");
    }
    // The same for settings the hiring product needs: several fail silently (see lib/ops/production-config.ts).
    const { hiringSettingProblems } = await import("./lib/ops/production-config");
    const problems = hiringSettingProblems();
    if (problems.length && process.env.NODE_ENV === "production") {
      for (const p of problems) console.error(`[config] ${p}`);
      Sentry.captureMessage(`[config] Hiring settings missing: ${problems.length} group(s). See the server log for names.`, "error");
    }
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Plan prices and limits set in the admin (lib/catalog/server.ts): applied before the first request, then kept
    // current. unref so the timer never holds a process open.
    const { ensureCatalog } = await import("./lib/catalog/server");
    await ensureCatalog();
    setInterval(() => { void ensureCatalog({ fresh: true }); }, 60_000).unref?.();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
