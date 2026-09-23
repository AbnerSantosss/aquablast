import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Proteção do painel: qualquer rota /admin (exceto /admin/login) exige cookie de sessão válido.
 * Só valida a assinatura (sem banco) para ficar leve; o banco é consultado nas páginas.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return NextResponse.next();

  const token = request.cookies.get("aqb_admin")?.value;
  const secret = process.env.SESSION_SECRET;
  let ok = false;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
      ok = payload.kind === "admin";
    } catch {
      ok = false;
    }
  }
  if (ok) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = pathname !== "/admin" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
