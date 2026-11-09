import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Brand } from "./Brand";

it("links the mark and the Niryat wordmark home", () => {
  const html = renderToStaticMarkup(<Brand href="/overview" />);
  expect(html).toContain('class="brand-link" href="/overview"');
  expect(html).toContain('class="brand-mark"');
  expect(html).toContain('<span class="brand-name">Niryat</span>');
  expect(html).not.toContain("निर्यात");
});
