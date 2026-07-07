export default function NotFound() {
  return (
    <main>
      <div className="empty-state">
        <h1 style={{ marginBottom: 8 }}>404</h1>
        <p>This page couldn&apos;t be found.</p>
        <p style={{ marginTop: 16 }}>
          <a href="/dashboard">&larr; Back to matched tenders</a>
        </p>
      </div>
    </main>
  );
}
