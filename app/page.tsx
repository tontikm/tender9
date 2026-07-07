import { IconBuilding, IconTag, IconCalendar } from "./components/icons";

export default function MarketingHomePage() {
  return (
    <main className="marketing-main">
      <section className="hero">
        <h1 className="hero-title">Never miss a government tender your business can win.</h1>
        <p className="hero-subtitle">
          Tender9 watches the National Treasury eTenders feed around the clock, scores every
          new tender against your business profile, and puts only the relevant ones in front
          of you.
        </p>
        <div className="hero-actions">
          <a href="/signup" className="btn-primary">
            Start free
          </a>
          <a href="/login" className="btn-secondary">
            Sign in
          </a>
        </div>
      </section>

      <section className="feature-grid">
        <div className="feature-card">
          <IconBuilding className="feature-icon" />
          <h3>Automatic ingestion</h3>
          <p>
            Every tender published on the eTenders OCDS feed is pulled in daily — no manual
            checking, no missed opportunities.
          </p>
        </div>
        <div className="feature-card">
          <IconTag className="feature-icon" />
          <h3>Smart matching</h3>
          <p>
            Set keywords, categories, provinces, and value ranges once. Every tender gets scored
            against your criteria automatically.
          </p>
        </div>
        <div className="feature-card">
          <IconCalendar className="feature-icon" />
          <h3>Track your pipeline</h3>
          <p>
            Save the ones worth pursuing, mark what you've applied for, and dismiss the rest —
            all in one dashboard.
          </p>
        </div>
      </section>

      <section className="cta-band">
        <h2>Set up your matching profile in minutes.</h2>
        <a href="/signup" className="btn-primary">
          Create your account
        </a>
      </section>
    </main>
  );
}
