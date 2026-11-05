import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { glossary } from "../../lib/glossary";
import Home from "./page";

it("explains the home-page terms without JavaScript and keeps approval and sandbox limits visible", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Prepare your Indian export records from PayPal.");
  for (const id of [
    "lut",
    "purpose_code",
    "fira",
    "realisation",
    "gstr1",
    "advance_tax",
  ] as const) {
    expect(html).toContain(glossary[id].plain);
    expect(html).toContain(`>${glossary[id].term}</abbr>`);
  }
  expect(html).toContain("You approve every PayPal action");
  expect(html).toContain("Sandbox only; nothing is filed for you");
  expect(html).not.toContain("<script");
});
