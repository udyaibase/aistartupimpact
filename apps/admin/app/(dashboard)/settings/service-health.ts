// Server-only helpers for the System Info → Service Health panel.
// Each check is independent, time-limited, and never throws.
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export type ServiceStatus = "ok" | "warning" | "error" | "not_configured";

export interface ServiceCheck {
  id: string;
  name: string;
  status: ServiceStatus;
  detail: string;
  latencyMs: number | null;
}

const TIMEOUT_MS = 5000;

const signal = () => AbortSignal.timeout(TIMEOUT_MS);

function describeError(e: any): string {
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return `No response within ${TIMEOUT_MS / 1000}s`;
  if (e?.name === "SignatureDoesNotMatch") return "Credentials rejected (SignatureDoesNotMatch)";
  if (e?.cause?.code === "ECONNREFUSED") return "Connection refused — the service is not running or not reachable";
  if (e?.cause?.code === "ENOTFOUND") return "Host not found — check the URL / DNS";
  const cause = e?.cause?.code ? ` (${e.cause.code})` : "";
  return `${e?.name || "Error"}: ${e?.message || "Unknown error"}${cause}`;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

async function checkStorage(): Promise<{ check: ServiceCheck; sampleKey: string | null }> {
  const base = { id: "storage", name: "R2 file storage" };
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return { check: { ...base, status: "not_configured", detail: "R2 environment variables are missing", latencyMs: null }, sampleKey: null };
  }
  try {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
    const { value, ms } = await timed(() =>
      s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 1 }), { abortSignal: signal() })
    );
    const sampleKey = value.Contents?.[0]?.Key ?? null;
    return { check: { ...base, status: "ok", detail: `Bucket "${R2_BUCKET_NAME}" reachable`, latencyMs: ms }, sampleKey };
  } catch (e) {
    return { check: { ...base, status: "error", detail: describeError(e), latencyMs: null }, sampleKey: null };
  }
}

// Fetches a real uploaded file through the public domain, so redirects or
// misrouted DNS (which break every logo and image) show up here.
async function checkMediaDomain(sampleKey: string | null): Promise<ServiceCheck> {
  const base = { id: "media", name: "Public media domain" };
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!publicUrl) return { ...base, status: "not_configured", detail: "R2_PUBLIC_URL is not set", latencyMs: null };

  const host = publicUrl.replace(/^https?:\/\//, "");
  const url = sampleKey ? `${publicUrl}/${sampleKey.split("/").map(encodeURIComponent).join("/")}` : publicUrl;
  try {
    const { value: res, ms } = await timed(() =>
      fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal: signal() })
    );
    if (res.status >= 300 && res.status < 400) {
      return { ...base, status: "error", detail: `${host} redirects (${res.status}) to ${res.headers.get("location") || "another URL"} — uploaded files will not load`, latencyMs: ms };
    }
    if (!sampleKey) {
      return { ...base, status: "warning", detail: `${host} responded (HTTP ${res.status}), but there is no uploaded file to test with`, latencyMs: ms };
    }
    if (res.ok) return { ...base, status: "ok", detail: `${host} is serving uploaded files`, latencyMs: ms };
    return { ...base, status: "error", detail: `${host} returned HTTP ${res.status} for an existing file`, latencyMs: ms };
  } catch (e) {
    return { ...base, status: "error", detail: describeError(e), latencyMs: null };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const base = { id: "redis", name: "Redis (Upstash)" };
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { ...base, status: "not_configured", detail: "UPSTASH_REDIS_REST_URL / TOKEN are not set", latencyMs: null };
  try {
    const { value: res, ms } = await timed(() =>
      fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: signal() })
    );
    const body = await res.json().catch(() => null);
    if (res.ok && body?.result === "PONG") return { ...base, status: "ok", detail: "Responding to PING", latencyMs: ms };
    return { ...base, status: "error", detail: body?.error || `HTTP ${res.status}`, latencyMs: ms };
  } catch (e) {
    return { ...base, status: "error", detail: describeError(e), latencyMs: null };
  }
}

async function checkSearch(): Promise<ServiceCheck> {
  const base = { id: "search", name: "Search (Meilisearch)" };
  const url = process.env.MEILI_URL?.replace(/\/$/, "");
  if (!url) return { ...base, status: "not_configured", detail: "MEILI_URL is not set", latencyMs: null };
  try {
    const { value: res, ms } = await timed(() => fetch(`${url}/health`, { cache: "no-store", signal: signal() }));
    const body = await res.json().catch(() => null);
    if (res.ok && body?.status === "available") return { ...base, status: "ok", detail: "Available", latencyMs: ms };
    return { ...base, status: "error", detail: body?.message || `HTTP ${res.status}`, latencyMs: ms };
  } catch (e) {
    return { ...base, status: "error", detail: describeError(e), latencyMs: null };
  }
}

async function checkEmail(): Promise<ServiceCheck> {
  const base = { id: "email", name: "Email (Resend)" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ...base, status: "not_configured", detail: "RESEND_API_KEY is not set", latencyMs: null };
  try {
    const { value: res, ms } = await timed(() =>
      fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: signal() })
    );
    const body = await res.json().catch(() => null);
    if (res.ok) {
      const domains: Array<{ name: string; status: string }> = body?.data ?? [];
      const unverified = domains.filter((d) => d.status !== "verified").map((d) => d.name);
      if (unverified.length > 0) {
        return { ...base, status: "warning", detail: `API key valid; not verified: ${unverified.join(", ")}`, latencyMs: ms };
      }
      return { ...base, status: "ok", detail: `API key valid · ${domains.length} verified domain${domains.length === 1 ? "" : "s"}`, latencyMs: ms };
    }
    // Sending-only keys can't list domains, but the 401 still proves the key is recognised
    if (res.status === 401 && body?.name === "restricted_api_key") {
      return { ...base, status: "ok", detail: "API key valid (sending-only access)", latencyMs: ms };
    }
    return { ...base, status: "error", detail: body?.message || `HTTP ${res.status}`, latencyMs: ms };
  } catch (e) {
    return { ...base, status: "error", detail: describeError(e), latencyMs: null };
  }
}

export async function runServiceChecks(): Promise<ServiceCheck[]> {
  const storagePromise = checkStorage();
  const [storage, redis, search, email] = await Promise.all([
    storagePromise, checkRedis(), checkSearch(), checkEmail(),
  ]);
  const media = await checkMediaDomain(storage.sampleKey);
  return [storage.check, media, redis, search, email];
}
