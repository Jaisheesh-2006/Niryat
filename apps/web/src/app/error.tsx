"use client";

import Link from "next/link";
import { TriangleAlert } from "../components/icons";

export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main id="main">
      <div className="card" role="alert">
        <div className="banner" data-tone="danger">
          <TriangleAlert />
          <h2>Couldn't load this page</h2>
        </div>
        <p>Niryat couldn't reach its server. Nothing was sent to PayPal.</p>
        <button type="button" className="btn" data-variant="primary" onClick={retry}>
          Try again
        </button>{" "}
        <Link href="/overview" className="btn" data-variant="secondary">
          Go to Today
        </Link>
      </div>
    </main>
  );
}
