export const metadata = { title: "Disclaimer" };

export default function Disclaimer() {
  return (
    <>
      <h1>Disclaimer</h1>
      <p>
        Niryat prepares information and documents to help users and their chartered accountants. It
        does not provide tax or legal advice, does not file returns on anyone&apos;s behalf, and
        only takes PayPal actions (such as sending invoices or reminders) after the user approves
        them. Rules are sourced, versioned and checked against official primary texts, but have not
        been reviewed by a chartered accountant; this is a known limitation of the hackathon build.
        Each deployment also acts on one PayPal seller account; connecting each user&apos;s own
        PayPal account (Partner Referrals) is future work (
        <a href="https://github.com/Jaisheesh-2006/Niryat/blob/main/docs/paypal-sandbox-findings.md#multi-seller-partner-referrals-limitation-and-future-work-2026-10-29">
          findings
        </a>
        ). Confirm anything you act on with a qualified CA.
      </p>
    </>
  );
}
