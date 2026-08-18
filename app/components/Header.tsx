import { getCurrentUser } from "@/lib/supabase-auth";
import { signOut } from "../login/actions";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a href={user ? "/home" : "/"} className="brand">
          <span className="brand-mark">T9</span>
          <span className="brand-name">Tender9</span>
        </a>

        {user ? (
          <nav className="site-nav">
            <a href="/workspace" className="site-nav-primary">
              My Workspace
            </a>
            <a href="/dashboard">Tenders</a>
            <a href="/browse">Browse</a>
            {/* Fill PDF and Request quotes moved into the Workspace hub —
                7 top-level links plus sign-out was too loud for what are,
                day to day, secondary tools rather than places you land. */}
            <a href="/profiles">Profiles</a>
            <a href="/company">Company</a>
            <form action={signOut}>
              <button type="submit" className="signout-button">
                Sign out
              </button>
            </form>
          </nav>
        ) : (
          /* Signed-out visitors previously got no nav at all, which left the
             public pages with no route to sign in or sign up from the header. */
          <nav className="site-nav">
            {/* Hidden on the narrowest screens, where the header can't fit
                three items — the hero and closing bands both link to Browse. */}
            <a href="/browse" className="site-nav-hide-sm">
              Browse tenders
            </a>
            <a href="/login">Sign in</a>
            <a href="/signup" className="site-nav-cta">
              Start free
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}
