import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { ReactNode } from "react";
import { requirePermission } from "./require-permission";
import type { Permission } from "./permissions";

export function NoAccess() {
  return (
    <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400 font-jakarta">
      Your role in this workspace doesn’t include this page.
    </p>
  );
}

/**
 * Server check for organizer pages that load their data in the browser: null when allowed, otherwise what to show
 * instead. "owner" = only the workspace owner (not teammates, whatever their role).
 */
export async function organizerPageGate(need: Permission | "owner"): Promise<ReactNode | null> {
  const session = await requirePermission(need === "owner" ? "settings" : need);
  if (session instanceof NextResponse) {
    if (session.status === 401) redirect("/organizer/login");
    return <NoAccess />;
  }
  if (need === "owner" && session.role !== "OWNER") return <NoAccess />;
  return null;
}
