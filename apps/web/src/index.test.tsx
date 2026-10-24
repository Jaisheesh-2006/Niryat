import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "./app/page";

it("renders the placeholder home page without external services", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("<h1>Niryat</h1>");
  expect(html).toContain("Product features are not implemented yet");
});
