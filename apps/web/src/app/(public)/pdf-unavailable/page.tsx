export const metadata = { title: "Invoice PDF unavailable" };

// Buyers reach this from the PDF link in a PayPal invoice, so it needs no Niryat account.
export default async function PdfUnavailable({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reason } = await searchParams;
  return (
    <div className="card">
      {reason === "storage" ? (
        <>
          <h1>Invoice PDF temporarily unavailable</h1>
          <p>The file couldn't be loaded right now. Try the link again in a few minutes.</p>
        </>
      ) : (
        <>
          <h1>Invoice PDF not found</h1>
          <p>
            This link is incomplete or the file no longer exists. Ask the person who sent the
            invoice for a new link.
          </p>
        </>
      )}
    </div>
  );
}
