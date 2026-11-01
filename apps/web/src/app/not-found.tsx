import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main">
      <div className="card">
        <h1>Page not found</h1>
        <p>This page doesn't exist or has moved.</p>
        <Link href="/overview" className="btn" data-variant="primary">
          Go to Today
        </Link>
      </div>
    </main>
  );
}
