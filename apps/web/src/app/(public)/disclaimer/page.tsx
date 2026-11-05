import { PageHeader } from "../../../components/PageHeader";

export const metadata = { title: "Disclaimer" };

export default function Disclaimer() {
  return (
    <>
      <PageHeader
        title="Disclaimer"
        description="Understand what Niryat prepares and what you should confirm with your chartered accountant."
      />
      <p>
        Niryat prepares information and documents for you and your chartered accountant (CA). It
        does not provide tax or legal advice or file returns for you. Every PayPal action, including
        sending invoices and reminders, needs your approval.
      </p>
      <p>
        Rules have sources and versions and have been checked against official primary texts. A CA
        has not reviewed them; this is a known limitation of this hackathon build. Confirm anything
        you act on with a qualified CA.
      </p>
      <p>
        Each deployment uses one PayPal seller account. Connecting each user&apos;s own PayPal
        account through Partner Referrals is future work (
        <a href="https://github.com/Jaisheesh-2006/Niryat/blob/main/docs/paypal-sandbox-findings.md#multi-seller-partner-referrals-limitation-and-future-work-2026-10-29">
          findings
        </a>
        ).
      </p>
    </>
  );
}
