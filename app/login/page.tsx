import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-main">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="subtitle">Tender9: SA tender monitoring</p>

        {params.message && <p className="auth-notice">{params.message}</p>}
        {params.error && <p className="auth-error">{params.error}</p>}

        <form action={signIn} className="auth-form">
          <div className="form-field">
            <label>Email</label>
            <input type="email" name="email" required autoFocus />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input type="password" name="password" required />
          </div>
          <button type="submit">Sign in</button>
        </form>

        <p className="auth-switch">
          <a href="/forgot-password">Forgot your password?</a>
        </p>
        <p className="auth-switch">
          Don&apos;t have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </main>
  );
}
