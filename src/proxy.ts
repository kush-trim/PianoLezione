import { NextResponse, type NextRequest } from "next/server";

// Controllo ottimistico: senza cookie di sessione si va al login.
// La verifica vera della sessione avviene in ogni API (requireUser).
const PUBLIC = ["/login", "/registrati"];

export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("ps_session");
  const isPublic = PUBLIC.includes(req.nextUrl.pathname);
  if (!hasSession && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\.).*)"],
};
