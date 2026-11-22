import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { buildAdminCsp, newNonce } from "@/lib/csp";

/** Continue to the page with a strict CSP carrying a fresh nonce (lib/csp.ts). Next.js reads the nonce from the
 *  request header and puts it on its own scripts; the response header is what the browser enforces. */
function nextWithCsp(req: NextRequest) {
  const csp = buildAdminCsp(newNonce());
  const headers = new Headers(req.headers);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

const PUBLIC_PATHS = ["/login", "/verify-2fa", "/setup-2fa", "/api/auth", "/api/admin/verify-2fa", "/api/admin/2fa-setup", "/api/admin/2fa-status", "/api/admin/2fa-disable"];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"))) {
      return nextWithCsp(req);
    }

    if (token?.require2FA && !token?.twoFactorEnabled) {
      return NextResponse.redirect(new URL("/setup-2fa", req.url));
    }

    if (token?.twoFactorEnabled && !token?.twoFactorVerified) {
      return NextResponse.redirect(new URL("/verify-2fa", req.url));
    }

    return nextWithCsp(req);
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
