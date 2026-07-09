import { getCurrentUser } from "@/lib/supabase-auth";
import { signOut } from "../login/actions";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a href={user ? "/dashboard" : "/"} className="brand">
          <span className="brand-mark">T9</span>
          <span className="brand-name">Tender9</span>
        </a>
        {user && (
          <nav className="site-nav">
            <a href="/dashboard">Tenders</a>
            <a href="/browse">Browse</a>
            <a href="/profiles">Profiles</a>
            <a href="/company">Company</a>
            <form action={signOut}>
              <button type="submit" className="signout-button">
                Sign out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
