export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-main">
      <h1>Privacy Policy</h1>
      <p className="subtitle">Last updated: 17 August 2026</p>

      <p>
        Tender9 (&quot;Tender9&quot;, &quot;we&quot;, &quot;us&quot;) provides a South African
        government tender monitoring and matching service. This policy explains what personal
        information we collect, why, and your rights under the Protection of Personal Information
        Act (POPIA).
      </p>

      <h2>1. Who we are</h2>
      <p>
        Tender9 is operated by Tender9 (Pty) Ltd (company registration in progress). For any
        privacy question or request, contact us at{" "}
        <a href="mailto:privacy@tender9.co.za">privacy@tender9.co.za</a>.
      </p>

      <h2>2. What we collect</h2>
      <p>When you create an account and use Tender9, we collect:</p>
      <ul>
        <li>Your email address and password (your password is hashed and never stored in plain text).</li>
        <li>
          The business/matching profile information you enter: company name, keywords,
          categories, provinces, and value ranges used to match you against government tenders.
        </li>
        <li>
          If you use the company profile and document-filling tools, the company details you
          enter there: registered name, CIPC registration number, VAT number, CSD number, SARS
          tax compliance PIN, B-BBEE level and certificate expiry, CIDB grade, physical address,
          contact details, banking details, and the name and capacity of your authorised
          signatory.
        </li>
        <li>
          Your usage of the service (which tenders you save, dismiss, or mark as applied), so we
          can show you your own pipeline.
        </li>
      </ul>
      <p>
        The company and banking details above are used only to pre-fill your own copy of
        official tender documents (SBD forms, RFQs). Tender9 does not process payments or move
        money on your behalf, and this data is never shared with third parties beyond the
        infrastructure providers listed below.
      </p>

      <h2>3. Why we process it</h2>
      <p>We use your information only to:</p>
      <ul>
        <li>Provide the tender-matching and monitoring service you signed up for.</li>
        <li>Authenticate you and keep your account secure.</li>
        <li>Communicate with you about your account or the service.</li>
      </ul>
      <p>
        The legal basis for this processing is your consent (given when you create an account)
        and the necessity of processing to perform our contract with you.
      </p>

      <h2>4. Who we share it with</h2>
      <p>
        We do not sell or rent your personal information. It is shared only with the service
        providers that host and run Tender9 on our behalf, under contract, and only to the extent
        needed to provide the service:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong>: our database and authentication provider. Your account data
          and matching profiles are stored in Supabase&apos;s infrastructure.
        </li>
        <li>
          <strong>Vercel</strong>: our application hosting provider.
        </li>
      </ul>
      <p>
        Tender data itself (tender titles, descriptions, buyer names, closing dates, etc.) comes
        from National Treasury&apos;s public eTenders OCDS feed. This is public government
        information, not personal information about you.
      </p>

      <h2>5. Where your data is stored</h2>
      <p>
        Your data is stored with our infrastructure providers. We aim to host data within South
        Africa where practical to support POPIA data residency expectations; the specific hosting
        region is confirmed in our infrastructure configuration and available on request.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We retain your account and profile information for as long as your account is active. If
        you delete your account, or ask us to delete it, we will delete your personal information
        within a reasonable period, except where we are required to retain limited records by law.
      </p>

      <h2>7. Security</h2>
      <p>
        Connections to Tender9 are encrypted in transit (HTTPS). Passwords are hashed by our
        authentication provider and never visible to us in plain text. Access to your data within
        our database is enforced by row-level security policies scoped to your account, so one
        account cannot access another account&apos;s data.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use a small number of essential cookies to keep you signed in. We do not use
        advertising or third-party tracking cookies.
      </p>

      <h2>9. Your rights under POPIA</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Ask us what personal information we hold about you.</li>
        <li>Ask us to correct inaccurate information.</li>
        <li>Ask us to delete your personal information or close your account.</li>
        <li>Object to our processing of your information, in certain circumstances.</li>
        <li>
          Lodge a complaint with South Africa&apos;s Information Regulator if you believe we have
          not handled your information properly.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email{" "}
        <a href="mailto:privacy@tender9.co.za">privacy@tender9.co.za</a>.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy as Tender9 evolves. We will post the updated version here with
        a new &quot;last updated&quot; date, and for material changes we will notify you directly.
      </p>

      <p className="legal-footnote">
        This policy is a plain-language summary and does not constitute legal advice. If you have
        specific compliance concerns, please consult a qualified attorney.
      </p>
    </main>
  );
}
