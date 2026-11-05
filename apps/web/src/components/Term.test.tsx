import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { glossary } from "../lib/glossary";
import { Term } from "./Term";

it("renders a visible explanation before the term without JavaScript", () => {
  const html = renderToStaticMarkup(
    <p>
      <Term term="lut" />
    </p>,
  );
  const descriptionId = html.match(/id="([^"]+)"/)?.[1];
  expect(descriptionId).toBeTruthy();
  expect(html).toContain(`<span id="${descriptionId}">${glossary.lut.plain}</span>`);
  expect(html).toContain(`aria-describedby="${descriptionId}"`);
  expect(html).toContain(`title="${glossary.lut.plain}"`);
  expect(html).toContain(`>${glossary.lut.term}</abbr>`);
  expect(html.indexOf(glossary.lut.plain)).toBeLessThan(html.indexOf("<abbr"));
  expect(html).not.toContain("<script");
});

it("gives repeated terms separate description targets", () => {
  const html = renderToStaticMarkup(
    <p>
      <Term term="fira" />
      <Term term="fira" />
    </p>,
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) expect(html).toContain(`aria-describedby="${id}"`);
});
