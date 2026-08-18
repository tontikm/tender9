import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { Reveal } from "./components/Reveal";
import { Countdown } from "./components/Countdown";
import { humanize, clip } from "@/lib/tender-text";

export const dynamic = "force-dynamic";

interface ShowcaseTender {
  id: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  closing_date: string | null;
  briefing_date: string | null;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** A tender reads well on the marketing page when its description is a real
 *  sentence rather than a bare reference code or a wall of specification. */
function isShowcaseable(t: ShowcaseTender): boolean {
  const d = t.description?.replace(/\s+/g, " ").trim() ?? "";
  return d.length >= 40 && d.length <= 190 && /[a-z]/i.test(d) && !!t.buyer_name;
}

async function getHomeData() {
  const supabase = await getSupabaseAuthClient();
  const now = new Date();
  const nowIso = now.toISOString();
  // Trailing 24h rather than "since midnight" — ingestion runs continuously,
  // so a calendar-day window would read 0 for hours after midnight.
  const last24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekEndIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [openRes, addedRes, closingRes, feedRes] = await Promise.all([
    supabase.from("tenders").select("id", { count: "planned", head: true }).gte("closing_date", nowIso),
    supabase.from("tenders").select("id", { count: "exact", head: true }).gte("created_at", last24hIso),
    supabase
      .from("tenders")
      .select("id", { count: "planned", head: true })
      .gte("closing_date", nowIso)
      .lte("closing_date", weekEndIso),
    supabase
      .from("tenders")
      .select("id, title, description, buyer_name, category, province, closing_date, briefing_date")
      .gte("closing_date", nowIso)
      .order("closing_date", { ascending: true })
      .limit(240)
      .returns<ShowcaseTender[]>(),
  ]);

  const usable = (feedRes.data ?? []).filter(isShowcaseable);

  // Prefer one per province so the showcase reflects national coverage
  // instead of three near-identical Gauteng notices.
  const seen = new Set<string>();
  const varied: ShowcaseTender[] = [];
  for (const t of usable) {
    const key = t.province ?? "National";
    if (seen.has(key)) continue;
    seen.add(key);
    varied.push(t);
    if (varied.length === 3) break;
  }
  while (varied.length < 3 && usable.length > varied.length) {
    const next = usable.find((t) => !varied.includes(t));
    if (!next) break;
    varied.push(next);
  }

  // The countdown needs a tender with real time left on it. The literal
  // soonest is often closing within hours, which would tick down to "Closed"
  // while somebody is still reading the page, so require a day of headroom
  // and only fall back to the soonest if nothing qualifies.
  const leadCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return {
    open: openRes.count ?? 0,
    added: addedRes.count ?? 0,
    closing: closingRes.count ?? 0,
    showcase: varied,
    soonest:
      usable.find((t) => t.closing_date && t.closing_date > leadCutoff) ??
      usable.find((t) => t.closing_date) ??
      null,
  };
}

const FAQS = [
  {
    q: "Where does the tender data come from?",
    a: "Every tender comes straight from National Treasury's official eTenders OCDS feed. It's the same public data South African government departments publish themselves. We don't create, edit, or curate tenders; we monitor them, match them to your business, and help you prepare a bid.",
  },
  {
    q: "How often does it update?",
    a: "Automatically, once a day. New and updated tenders are pulled in, matched against your profile, and waiting in your dashboard the next time you check.",
  },
  {
    q: "Is Tender9 an official government service?",
    a: "No. Tender9 is an independent tool, not affiliated with National Treasury or any government department. We simply make their public tender data easier to monitor and act on. Always confirm final requirements against the official tender documents before submitting a bid.",
  },
  {
    q: "What happens to the details I add?",
    a: "Your company details (registration, tax, B-BBEE, banking, and so on) are stored securely and used only to pre-fill your own copy of official tender forms. They're never shared with third parties beyond the infrastructure providers that host Tender9. Full details in our privacy policy.",
  },
];

function TenderRow({ tender }: { tender: ShowcaseTender }) {
  const days = daysUntil(tender.closing_date);
  return (
    <a className="m-row" href={`/tenders/${tender.id}`}>
      <span className="m-row-body">
        <span className="m-row-title">{humanize(clip(tender.description ?? tender.title, 92))}</span>
        <span className="m-row-meta">
          {tender.buyer_name}
          {tender.province ? <span className="m-dot-sep">{tender.province}</span> : null}
        </span>
      </span>
      <span className={`m-row-due ${days <= 3 ? "is-urgent" : ""}`}>
        <span className="m-row-days">{days}</span>
        <span className="m-row-dayl">{days === 1 ? "day" : "days"}</span>
      </span>
    </a>
  );
}

export default async function MarketingHomePage() {
  const { open, added, closing, showcase, soonest } = await getHomeData();
  const fmt = (n: number) => n.toLocaleString("en-ZA");

  return (
    <main className="m-main">
      {/* ---------- Hero ---------- */}
      <section className="m-hero">
        <p className="m-kicker">
          <span className="m-live" aria-hidden="true" />
          {fmt(open)} tenders open right now
        </p>
        <h1 className="m-display">
          Every government tender.
          <span className="m-display-dim">The moment it opens.</span>
        </h1>
        <p className="m-lede">
          Tender9 reads the National Treasury feed so you don&apos;t have to, matches every new
          tender against your business, and gets the paperwork ready before the deadline does.
        </p>
        <div className="m-cta-row">
          <a href="/signup" className="m-btn">
            Start free
          </a>
          <a href="/browse" className="m-textlink">
            Browse all tenders
          </a>
        </div>

        {showcase.length > 0 && (
          <div className="m-stage">
            <div className="m-panel">
              <div className="m-panel-top">
                <span className="m-panel-label">
                  <span className="m-live" aria-hidden="true" />
                  Live from the feed
                </span>
                <span className="m-panel-hint">Closing soonest</span>
              </div>
              {showcase.map((t) => (
                <TenderRow key={t.id} tender={t} />
              ))}
              <a className="m-panel-foot" href="/browse">
                See all {fmt(open)} open tenders
              </a>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Scale ---------- */}
      <section className="m-band m-dark">
        <Reveal>
          <h2 className="m-h2">
            The whole feed.
            <span className="m-h2-dim">Checked every single day.</span>
          </h2>
        </Reveal>
        <div className="m-figures">
          <Reveal delay={0}>
            <p className="m-fig">{fmt(open)}</p>
            <p className="m-fig-label">tenders open right now</p>
          </Reveal>
          <Reveal delay={90}>
            <p className="m-fig">{fmt(added)}</p>
            <p className="m-fig-label">added in the last 24 hours</p>
          </Reveal>
          <Reveal delay={180}>
            <p className="m-fig">{fmt(closing)}</p>
            <p className="m-fig-label">closing within the week</p>
          </Reveal>
        </div>
      </section>

      {/* ---------- Matching ---------- */}
      <section className="m-band m-gray">
        <Reveal>
          <p className="m-eyebrow">Matching</p>
          <h2 className="m-h2">
            It reads all {fmt(open)}.
            <span className="m-h2-dim">You read the handful that fit.</span>
          </h2>
          <p className="m-body">
            Tell it your keywords, categories, provinces and value range once. Every new tender is
            scored against that the day it lands, so what reaches you is already relevant.
          </p>
        </Reveal>

        {showcase[0] && (
          <Reveal delay={120}>
            <div className="m-match">
              <div className="m-match-head">
                <span className="m-chip m-chip-on">Matched</span>
                <span className="m-match-why">
                  category and province match your profile
                </span>
              </div>
              <p className="m-match-title">
                {humanize(clip(showcase[0].description ?? showcase[0].title, 130))}
              </p>
              <div className="m-chips">
                {showcase[0].category && <span className="m-chip">{showcase[0].category}</span>}
                {showcase[0].province && <span className="m-chip">{showcase[0].province}</span>}
                {showcase[0].closing_date && (
                  <span className="m-chip">Closes {shortDate(showcase[0].closing_date)}</span>
                )}
              </div>
            </div>
          </Reveal>
        )}
      </section>

      {/* ---------- Documents ---------- */}
      <section className="m-band">
        <Reveal>
          <p className="m-eyebrow">Paperwork</p>
          <h2 className="m-h2">
            The official forms.
            <span className="m-h2-dim">Already filled in.</span>
          </h2>
          <p className="m-body">
            Save your company details once: registration, tax, B-BBEE, banking, signatory. Then
            place them straight onto the tender&apos;s real PDF forms, signature included, and
            download a bid pack that&apos;s ready to submit.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="m-doc">
            <div className="m-doc-head">
              <span className="m-doc-name">SBD 4: Declaration of Interest</span>
              <span className="m-chip m-chip-on">Auto-filled</span>
            </div>
            <dl className="m-doc-fields">
              <div>
                <dt>Full name of bidder</dt>
                <dd>Your registered company name</dd>
              </div>
              <div>
                <dt>Company registration number</dt>
                <dd>2021/123456/07</dd>
              </div>
              <div>
                <dt>Tax reference number</dt>
                <dd>Saved to your profile</dd>
              </div>
              <div>
                <dt>Signature of bidder</dt>
                <dd className="m-doc-sig">Drawn once, reused everywhere</dd>
              </div>
            </dl>
          </div>
        </Reveal>
      </section>

      {/* ---------- Deadlines ---------- */}
      {soonest?.closing_date && (
        <section className="m-band m-dark">
          <Reveal>
            <p className="m-eyebrow">Deadlines</p>
            <h2 className="m-h2">
              Nothing closes
              <span className="m-h2-dim">without warning.</span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="m-deadline">
              <p className="m-deadline-title">
                {humanize(clip(soonest.description ?? soonest.title, 96))}
              </p>
              <p className="m-deadline-buyer">{soonest.buyer_name}</p>
              <Countdown
                iso={soonest.closing_date}
                fallback={`${daysUntil(soonest.closing_date)} days left`}
              />
              <p className="m-deadline-note">
                One of the next tenders in the feed to close. Compulsory briefing sessions get
                their own calendar reminder too.
              </p>
            </div>
          </Reveal>
        </section>
      )}

      {/* ---------- Trust ---------- */}
      <section className="m-band m-gray">
        <Reveal>
          <h2 className="m-h2 m-h2-sm">Built to be trusted with your business.</h2>
        </Reveal>
        <div className="m-trust">
          <Reveal delay={0}>
            <h3>POPIA compliant</h3>
            <p>
              Your information is protected under South Africa&apos;s Protection of Personal
              Information Act: encrypted in transit, access-controlled per account, never sold.{" "}
              <a href="/privacy">Read the privacy policy</a>
            </p>
          </Reveal>
          <Reveal delay={90}>
            <h3>Straight from National Treasury</h3>
            <p>
              Every tender comes directly from government&apos;s own eTenders OCDS feed. Tender9 is
              an independent tool, not a government service.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <h3>Tender9 (Pty) Ltd</h3>
            <p>
              Company registration in progress. Questions or concerns?{" "}
              <a href="mailto:privacy@tender9.co.za">privacy@tender9.co.za</a>. We read every
              message.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="m-band">
        <Reveal>
          <h2 className="m-h2 m-h2-sm">Questions, answered.</h2>
        </Reveal>
        <div className="m-faq">
          {FAQS.map(({ q, a }) => (
            <details className="m-faq-item" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- Close ---------- */}
      <section className="m-band m-dark m-close">
        <Reveal>
          <h2 className="m-h2">
            Your next contract
            <span className="m-h2-dim">is already in the feed.</span>
          </h2>
          <div className="m-cta-row m-cta-center">
            <a href="/signup" className="m-btn m-btn-light">
              Start free
            </a>
            <a href="/browse" className="m-textlink m-textlink-light">
              Browse all tenders
            </a>
          </div>
          <p className="m-fineprint">No credit card. Covers every SA government tender.</p>
        </Reveal>
      </section>
    </main>
  );
}
