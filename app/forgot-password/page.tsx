import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-main">
      <div className="auth-card">
        <h1>Reset your password</h1>
        <p className="subtitle">Enter your email and we&apos;ll send you a link to choose a new one.</p>

        {params.error && <p className="auth-error">{params.error}</p>}

        {params.sent ? (
          <p className="auth-notice">
            If an account exists for that address, a reset link is on its way. Check your inbox
            (and spam folder) for an email from Tender9.
          </p>
        ) : (
          <form action={requestPasswordReset} className="auth-form">
            <div className="form-field">
              <label>Email</label>
              <input type="email" name="email" required autoFocus />
            </div>
            <button type="submit">Send reset link</button>
          </form>
        )}

        <p className="auth-switch">
          <a href="/login">Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
