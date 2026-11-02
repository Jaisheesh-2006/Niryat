import { healthReportSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { apiGet } from "../../../lib/api";
import HealthCheck from "./page";

vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));

it("labels the health bar and sorts flags without changing the report", async () => {
  const report = healthReportSchema.parse({
    score: 62,
    checkedOn: "2026-11-01",
    suggestion: null,
    flags: ["low", "high", "medium"].map((severity) => ({
      code: `lut_${{ low: "expiring", high: "expired", medium: "missing" }[severity]}`,
      severity,
      message: `${severity} priority finding`,
      citation: { ruleId: "R-LUT-01", source: "Fixture source", effectiveFrom: null },
      note: "Verify with your CA.",
    })),
  });
  vi.mocked(apiGet).mockResolvedValue(report);
  const html = renderToStaticMarkup(await HealthCheck());
  expect(html).toContain('role="img" aria-label="Health score 62 out of 100"');
  expect(html).toContain('style="width:62%"');
  expect(html).toContain("Checked on 1 Nov 2026");
  expect(html.indexOf("high priority finding")).toBeLessThan(
    html.indexOf("medium priority finding"),
  );
  expect(html.indexOf("medium priority finding")).toBeLessThan(
    html.indexOf("low priority finding"),
  );
  expect(report.flags.map((flag) => flag.severity)).toEqual(["low", "high", "medium"]);
});
