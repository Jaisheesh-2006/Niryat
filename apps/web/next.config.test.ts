import { expect, it } from "vitest";
import config from "./next.config";

it("sets the A1 security headers on every path", async () => {
  expect(await config.headers?.()).toEqual([
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ]);
});
