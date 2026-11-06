import Link from "next/link";
import {
  CalendarCheck,
  CircleCheck,
  FileText,
  LogOut,
  ShieldCheck,
  UserRound,
} from "../../components/icons";
import { JudgeEntry } from "../../components/JudgeEntry";
import { Term } from "../../components/Term";

export default function Home() {
  return (
    <>
      <section className="public-hero">
        <h1 className="display">Prepare your Indian export records from PayPal.</h1>
        <p>
          Prepare export invoices, match foreign-payment proof and track tax and payment deadlines
          from your PayPal activity. You approve every action.
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
        <JudgeEntry />
      </section>
      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <ol className="how-it-works">
          <li>
            <UserRound />
            <h3>Sign in</h3>
            <p>Complete your business profile and see what needs attention.</p>
            <p>
              <Term term="lut" />
            </p>
            <p>
              <Term term="purpose_code" />
            </p>
          </li>
          <li>
            <FileText />
            <h3>Bill</h3>
            <p>PayPal invoices, one-time or recurring.</p>
          </li>
          <li>
            <CircleCheck />
            <h3>Get paid</h3>
            <p>
              PayPal records the payment, its fee, what you receive and any exchange rate it
              provides.
            </p>
            <p>
              <Term term="fira" />
            </p>
          </li>
          <li>
            <LogOut />
            <h3>Handle changes</h3>
            <p>PayPal refunds and disputes update GST and RBI status.</p>
            <p>
              <Term term="realisation" />
            </p>
          </li>
          <li>
            <CalendarCheck />
            <h3>Close the month</h3>
            <p>Check payment proof, prepare tax records and approve PayPal reminders.</p>
            <p>
              <Term term="gstr1" />
            </p>
            <p>
              <Term term="advance_tax" />
            </p>
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
