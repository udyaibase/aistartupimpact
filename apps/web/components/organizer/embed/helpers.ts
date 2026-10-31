export function isLocalHostClient(host: string): boolean {
  const h = host.split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost") || h.endsWith(".test");
}

export async function apiJson<T = any>(url: string, init?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return await res.json();
  } catch {
    return { success: false, error: "You seem to be offline. Check your connection and try again." };
  }
}
