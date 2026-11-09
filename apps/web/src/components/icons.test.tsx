import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import * as icons from "./icons";

it.each(Object.entries(icons).filter(([name]) => name !== "BrandMark"))(
  "%s is decorative, inherits colour and accepts a size",
  (_name, Icon) => {
    const html = renderToStaticMarkup(<Icon />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('width="16" height="16"');
    expect(renderToStaticMarkup(<Icon size={18} />)).toContain('width="18" height="18"');
  },
);

it("renders the brand at 28px as a disc with a leaf", () => {
  const html = renderToStaticMarkup(<icons.BrandMark />);
  expect(html).toContain('class="brand-mark"');
  expect(html).toContain('width="28" height="28"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('class="brand-disc"');
  expect(html).toContain('d="M22 9c6 6 6 13 0 19c-6-6-6-13 0-19z"');
});
