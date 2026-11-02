import Link from "next/link";
import {
  CalendarCheck,
  CircleCheck,
  FileText,
  LogOut,
  ShieldCheck,
  UserRound,
} from "../../components/icons";

export default function Home() {
  return (
    <>
      <section className="public-hero">
        <h1 className="display">
          Run your export business on PayPal. Niryat keeps it legal in India.
        </h1>
        <p>
          GST-ready invoices, FIRA matching, RBI deadlines and advance tax, built from your PayPal
          activity. You approve every action.
        </p>
        <div className="hero-actions">
          <Link href="/signup" className="btn" data-variant="primary">
            Create account
          </Link>
          <a href="/api/auth/paypal/start" className="btn" data-variant="secondary">
            Log in with PayPal
          </a>
          <Link href="/login" className="btn" data-variant="ghost">
            Sign in
          </Link>
        </div>
      </section>
      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <ol className="how-it-works">
          <li>
            <UserRound />
            <h3>Sign in</h3>
            <p>With PayPal: health check, purpose code and LUT.</p>
          </li>
          <li>
            <FileText />
            <h3>Bill</h3>
            <p>PayPal invoices, one-time or recurring.</p>
          </li>
          <li>
            <CircleCheck />
            <h3>Get paid</h3>
            <p>PayPal webhooks record fee, net and FX.</p>
          </li>
          <li>
            <LogOut />
            <h3>Handle changes</h3>
            <p>PayPal refunds and disputes update GST and RBI status.</p>
          </li>
          <li>
            <CalendarCheck />
            <h3>Close the month</h3>
            <p>FIRA matching, GSTR-1 data, advance tax and PayPal reminders.</p>
          </li>
        </ol>
      </section>
      <section className="trust-grid" aria-label="Our commitments">
        <article className="card">
          <ShieldCheck />
          <h2>You approve every PayPal action</h2>
        </article>
        <article className="card">
          <FileText />
          <h2>Rules cite primary sources</h2>
        </article>
        <article className="card">
          <CircleCheck />
          <h2>Sandbox only; nothing is filed for you</h2>
        </article>
      </section>
    </>
  );
}
