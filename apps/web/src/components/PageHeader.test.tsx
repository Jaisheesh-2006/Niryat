import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

it("renders one h1 with its description and action", () => {
  const html = renderToStaticMarkup(
    <PageHeader title="Today" description="1 Nov 2026" actions={<a href="/profile">Profile</a>} />,
  );
  expect(html.match(/<h1>/g)).toHaveLength(1);
  expect(html).toContain("<h1>Today</h1>");
  expect(html).toContain("<p>1 Nov 2026</p>");
  expect(html).toContain('href="/profile"');
});

it("renders a title without optional content", () => {
  const html = renderToStaticMarkup(<PageHeader title="Today" />);
  expect(html).toContain("<h1>Today</h1>");
  expect(html).not.toContain("<p>");
});
