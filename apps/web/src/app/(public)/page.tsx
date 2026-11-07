import Link from "next/link";
import {
  CalendarCheck,
  CircleCheck,
  FileText,
  Lightbulb,
  LogOut,
  ShieldCheck,
  UserRound,
} from "../../components/icons";
import { JudgeEntry } from "../../components/JudgeEntry";
import { Term } from "../../components/Term";

// A static picture of the approval card; the real one lives on Today and Monthly close.
function ExampleApproval() {
  return (
    <figure className="hero-figure">
      <div className="card approval-card" data-status="proposed" aria-hidden="true">
        <div className="card-header">
          <span className="badge" data-tone="attention">
            Waiting for your approval
          </span>
          <span className="approval-kind">Reminder · 30-day stage</span>
        </div>
        <h3>Send PayPal&apos;s standard reminder for invoice 20260310/0004</h3>
        <dl className="approval-facts">
          <div>
            <dt>Amount</dt>
            <dd>$5,000.00</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>Northwind Analytics</dd>
          </div>
          <div>
            <dt>RBI deadline</dt>
            <dd>30 days left</dd>
          </div>
        </dl>
        <div className="approval-controls">
          <div className="suggestion">
            <p>
              <Lightbulb /> Suggestion from Claude
            </p>
            <p>Northwind usually pays within a week of a reminder. Send it now.</p>
          </div>
          <p className="approval-caption">Nothing is sent to PayPal until you approve.</p>
          <span className="btn" data-variant="secondary">
            Reject
          </span>
          <span className="btn" data-variant="primary">
            Send reminder
          </span>
        </div>
      </div>
      <figcaption>
        Example approval. Claude drafts and advises; only you can send it to PayPal.
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <section className="public-hero">
        <div className="hero-copy">
          <p className="eyebrow">For Indian freelancers paid from abroad</p>
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
        </div>
        <ExampleApproval />
      </section>
      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="section-title">
          How it works
        </h2>
        <p className="section-lead">From your first PayPal invoice to the month-end close.</p>
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
          <p>
            Niryat prepares invoices, reminders and refunds. Nothing reaches PayPal until you
            approve it.
          </p>
        </article>
        <article className="card">
          <FileText />
          <h2>Rules cite primary sources</h2>
          <p>Every deadline and tax figure names the act, rule or notification it comes from.</p>
        </article>
        <article className="card">
          <CircleCheck />
          <h2>Sandbox only; nothing is filed for you</h2>
          <p>
            Niryat prepares records for you and your CA. It never files returns, and it runs on
            PayPal&apos;s sandbox.
          </p>
        </article>
      </section>
    </>
  );
}
