export function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a href="/" className="brand">
          <span className="brand-mark">T9</span>
          <span className="brand-name">Tender9</span>
        </a>
        <nav className="site-nav">
          <a href="/">Tenders</a>
          <a href="/profiles">Profiles</a>
        </nav>
      </div>
    </header>
  );
}
