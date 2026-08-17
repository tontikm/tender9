export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>&copy; {new Date().getFullYear()} Tender9</span>
        <span className="site-footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="mailto:privacy@tender9.co.za">Contact</a>
        </span>
      </div>
    </footer>
  );
}
