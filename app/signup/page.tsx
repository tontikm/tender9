import { signUp } from "./actions";
import { signInWithGoogle } from "../login/actions";
import { GoogleButton } from "../components/GoogleButton";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-main">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="subtitle">Start monitoring SA government tenders</p>

        {params.error && <p className="auth-error">{params.error}</p>}

        <form action={signInWithGoogle}>
          <GoogleButton>Sign up with Google</GoogleButton>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form action={signUp} className="auth-form">
          <div className="form-field">
            <label>Company name</label>
            <input type="text" name="company_name" required autoFocus />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input type="email" name="email" required />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input type="password" name="password" required minLength={6} />
          </div>
          <button type="submit">Sign up</button>
        </form>

        <p className="auth-switch">
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </main>
  );
}
