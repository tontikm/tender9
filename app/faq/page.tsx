import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Common questions about Tender9: where the tender data comes from, how often it updates, whether it's an official government service, and what happens to your company details.",
};

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

export default function FaqPage() {
  return (
    <main className="m-main">
      <section className="m-band">
        <h1 className="m-h2 m-h2-sm">Frequently asked questions</h1>
        <div className="m-faq">
          {FAQS.map(({ q, a }) => (
            <details className="m-faq-item" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
