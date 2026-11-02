import { firaDocumentSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { apiGet } from "../../../lib/api";
import Fira from "./page";

vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("../../../components/FiraUpload", () => ({ FiraUpload: () => null }));

it("shows the flagged line badge and its reason in separate columns", async () => {
  vi.mocked(apiGet).mockResolvedValue([
    firaDocumentSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      month: "2026-10-01",
      uploadedAt: "2026-11-01T18:30:00Z",
      lines: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          position: 1,
          date: "2026-10-15",
          amount: "1200.00",
          currency: "USD",
          reference: "UNMATCHED-REF",
          purposeCode: "P0802",
          sourceText: "Unmatched source line",
          note: "No payment matches this reference.",
          match: null,
        },
      ],
    }),
  ]);
  const html = renderToStaticMarkup(await Fira());
  expect(html).toContain("FIRA for October 2026");
  expect(html).toContain("Uploaded 2 Nov 2026");
  expect(html).toContain('<th scope="col">Reason</th>');
  expect(html).toContain(
    'data-tone="danger">Flagged</span></td><td>No payment matches this reference.</td>',
  );
  expect(html).toContain('class="mono">UNMATCHED-REF</span>');
});
