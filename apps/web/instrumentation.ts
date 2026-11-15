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
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
