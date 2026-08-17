import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/" is the public marketing homepage — viewable when signed out, but
// signed-in users get bounced straight to /dashboard instead of seeing it.
const AUTH_ONLY_PATHS = ["/login", "/signup"];

// Always viewable regardless of auth state — signed-in users are NOT
// redirected away from these (unlike AUTH_ONLY_PATHS and "/"). The reset
// flow needs this: clicking the emailed link establishes a real session via
// /auth/reset, and the user must still land on /reset-password afterwards
// rather than being bounced to /dashboard for "already being signed in".
const ALWAYS_PUBLIC_PATHS = ["/privacy", "/forgot-password", "/reset-password", "/auth/reset", "/home"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthOnlyPath = AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));
  const isHomepage = pathname === "/";
  const isAlwaysPublicPath = ALWAYS_PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isAlwaysPublicPath) {
    return response;
  }

  if (!user && !isAuthOnlyPath && !isHomepage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (isAuthOnlyPath || isHomepage)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/ingest).*)"],
};
