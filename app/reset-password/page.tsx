import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-main">
      <div className="auth-card">
        <h1>Choose a new password</h1>
        <p className="subtitle">Pick something you haven&apos;t used before.</p>

        {params.error && <p className="auth-error">{params.error}</p>}

        <form action={updatePassword} className="auth-form">
          <div className="form-field">
            <label>New password</label>
            <input type="password" name="password" required minLength={6} autoFocus />
          </div>
          <div className="form-field">
            <label>Confirm new password</label>
            <input type="password" name="confirmPassword" required minLength={6} />
          </div>
          <button type="submit">Update password</button>
        </form>
      </div>
    </main>
  );
}
