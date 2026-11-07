import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Brand } from "./Brand";

it("links the mark and wordmark home and hides the Devanagari from assistive technology", () => {
  const html = renderToStaticMarkup(<Brand href="/overview" />);
  expect(html).toContain('class="brand-link" href="/overview"');
  expect(html).toContain('class="brand-mark"');
  expect(html).toContain("Niryat");
  expect(html).toContain('<span class="brand-hindi" lang="hi" aria-hidden="true">निर्यात</span>');
});
