import {
  IconBuilding,
  IconTag,
  IconCheck,
  IconDocument,
  IconClipboard,
  IconBell,
} from "./components/icons";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

async function getHomeStats() {
  const supabase = await getSupabaseAuthClient();
  const now = new Date();
  const nowIso = now.toISOString();
  // Trailing 24h rather than "since midnight" — ingestion runs continuously,
  // so a calendar-day window would show 0 for hours after midnight and
  // undercut the "round-the-clock" pitch right on the hero.
  const last24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekEndIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [openRes, addedTodayRes, closingSoonRes] = await Promise.all([
    supabase.from("tenders").select("id", { count: "planned", head: true }).gte("closing_date", nowIso),
    supabase.from("tenders").select("id", { count: "exact", head: true }).gte("created_at", last24hIso),
    supabase
      .from("tenders")
      .select("id", { count: "planned", head: true })
      .gte("closing_date", nowIso)
      .lte("closing_date", weekEndIso),
  ]);

  return {
    open: openRes.count ?? 0,
    addedToday: addedTodayRes.count ?? 0,
    closingSoon: closingSoonRes.count ?? 0,
  };
}

const FEATURES = [
  {
    Icon: IconBuilding,
    title: "Round-the-clock monitoring",
    body: "Every tender on the National Treasury eTenders feed is pulled in automatically, so there's no manual checking and no missed opportunities.",
  },
  {
    Icon: IconTag,
    title: "Smart matching",
    body: "Set your keywords, categories, provinces and value range once. Every new tender is scored against your criteria, so you only see what fits.",
  },
  {
    Icon: IconCheck,
    title: "Requirements at a glance",
    body: "For each tender, see exactly which documents you need, what qualifies you, and what can get your bid disqualified.",
  },
  {
    Icon: IconDocument,
    title: "Fill official forms in minutes",
    body: "Store your company details once, then click to place them directly onto any tender's actual PDF forms, signature included, ready to download.",
  },
  {
    Icon: IconClipboard,
    title: "A workspace per bid",
    body: "Turn a saved tender into a checklist: forms done, documents gathered, notes, and a live countdown to the closing date.",
  },
  {
    Icon: IconBell,
    title: "Never miss a deadline",
    body: "Closing-date sorting and calendar reminders for compulsory briefing sessions keep every important date on your radar.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Tell us what you do",
    body: "Add your keywords, categories and provinces, plus your company details: registration, tax, B-BBEE, banking. Just once.",
  },
  {
    n: "2",
    title: "Get matched tenders",
    body: "We score every new tender against your profile daily and surface the relevant ones, sorted by closing date.",
  },
  {
    n: "3",
    title: "Prepare and submit",
    body: "Work through the requirements checklist, fill in the official forms with your saved details, and submit with confidence.",
  },
];

export default async function MarketingHomePage() {
  const stats = await getHomeStats();

  return (
    <main className="marketing-main">
      <section className="hero">
        <span className="hero-eyebrow">Built for South African SMEs</span>
        <h1 className="hero-title">Never miss a government tender your business can win.</h1>
        <p className="hero-subtitle">
          Tender9 watches the National Treasury eTenders feed around the clock, scores every new
          tender against your business profile, and helps you prepare a compliant bid, from the
          requirements checklist to filling in the official forms.
        </p>
        <div className="hero-actions">
          <a href="/signup" className="btn-primary">
            Start free
          </a>
          <a href="/login" className="btn-secondary">
            Sign in
          </a>
        </div>
        <p className="hero-note">No credit card required · Covers all SA government tenders</p>

        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-number">{stats.open.toLocaleString("en-ZA")}</span>
            <span className="hero-stat-label">open tenders right now</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-number">{stats.addedToday.toLocaleString("en-ZA")}</span>
            <span className="hero-stat-label">added in the last 24 hours</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-number">{stats.closingSoon.toLocaleString("en-ZA")}</span>
            <span className="hero-stat-label">closing this week</span>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <h2 className="section-title">How it works</h2>
        <div className="steps-grid">
          {STEPS.map((step) => (
            <div className="step-card" key={step.n}>
              <span className="step-number">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="features">
        <h2 className="section-title">Everything you need to find and win work</h2>
        <div className="feature-grid">
          {FEATURES.map(({ Icon, title, body }) => (
            <div className="feature-card" key={title}>
              <Icon className="feature-icon" />
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <h2>Set up your matching profile in minutes.</h2>
        <p className="cta-sub">Start monitoring every SA government tender relevant to your business, free.</p>
        <a href="/signup" className="btn-primary">
          Create your account
        </a>
      </section>
    </main>
  );
}
