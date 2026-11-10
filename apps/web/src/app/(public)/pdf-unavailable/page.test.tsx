import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import PdfUnavailable from "./page";

const render = async (reason?: string) =>
  renderToStaticMarkup(await PdfUnavailable({ searchParams: Promise.resolve({ reason }) }));

it("tells a buyer to retry only when storage is down, otherwise to ask for a new link", async () => {
  expect(await render("storage")).toContain("Invoice PDF temporarily unavailable");
  for (const reason of [undefined, "anything"]) {
    const html = await render(reason);
    expect(html).toContain("Invoice PDF not found");
    expect(html).toContain("Ask the person who sent the invoice for a new link.");
  }
});
