import type { ExportInvoiceDocument } from "@niryat/rules";
import { breakTextIntoLines, PageSizes, PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";

export async function renderInvoicePdf(doc: ExportInvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const number = doc.rows.find((row) => row.label === "Invoice number")?.value;
  if (!number) throw new Error("Invoice number missing");
  pdf.setTitle(number);
  pdf.setCreator("Niryat");
  pdf.setProducer("Niryat");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(PageSizes.A4);
  const margin = 40;
  const maxWidth = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  function draw(text: string, font: PDFFont, size: number) {
    const measure = (value: string) => font.widthOfTextAtSize(value, size);
    const lines = breakTextIntoLines(text, [" "], maxWidth, measure).flatMap((line) =>
      measure(line) > maxWidth ? breakTextIntoLines(line, [""], maxWidth, measure) : [line],
    );
    for (const line of lines) {
      if (y < margin + size) {
        page = pdf.addPage(PageSizes.A4);
        y = page.getHeight() - margin;
      }
      page.drawText(line, { x: margin, y, font, size, maxWidth });
      y -= size + 4;
    }
    y -= 4;
  }

  draw(doc.title, bold, 18);
  for (const row of doc.rows) draw(`${row.label}: ${row.value}`, regular, 10);
  if (doc.endorsement) draw(doc.endorsement.toUpperCase(), bold, 10);
  draw(`Rule ${doc.citation.ruleId}: ${doc.citation.source}. Verify with your CA.`, regular, 9);
  return pdf.save();
}
