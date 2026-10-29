import { createHash, randomUUID } from "node:crypto";
import {
  decideFiraMatch,
  firaDocumentExists,
  listFiraDocuments,
  saveFiraDocument,
} from "@niryat/db";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { readSession } from "../auth/session";
import { extractPdfText, matchFiraLines, parseFiraText } from "../fira";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

export function firaRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/fira", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    return c.json(await listFiraDocuments(deps.db, userId));
  });
  routes.post(
    "/fira",
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c) => c.json({ error: "file_too_large" }, 413),
    }),
    async (c) => {
      const userId = await readSession(c, deps.sessionSecret);
      if (!userId) return c.json({ error: "unauthenticated" }, 401);
      if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/pdf")
        return c.json({ error: "unsupported_media_type" }, 415);
      if (c.req.header("X-Niryat-Consent") !== "own-fira")
        return c.json({ error: "consent_required" }, 400);
      const files = deps.files;
      if (!files) return c.json({ error: "file_storage_unavailable" }, 503);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (!Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from("%PDF-")))
        return c.json({ error: "fira_unreadable" }, 422);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (await firaDocumentExists(deps.db, userId, sha256))
        return c.json({ error: "fira_duplicate" }, 409);
      let parsed: ReturnType<typeof parseFiraText>;
      try {
        parsed = parseFiraText(await extractPdfText(bytes));
      } catch {
        return c.json({ error: "fira_unreadable" }, 422);
      }
      if (!parsed.ok) return c.json({ error: "fira_unreadable" }, 422);
      const parsedLines = parsed.lines;
      const id = randomUUID();
      const fileKey = `fira/${userId}/${id}.pdf`;
      const earliestDate = parsedLines.map((line) => line.date).sort()[0];
      if (!earliestDate) return c.json({ error: "fira_unreadable" }, 422);
      const saved = await saveFiraDocument(
        deps.db,
        userId,
        {
          id,
          sha256,
          fileKey,
          month: `${earliestDate.slice(0, 7)}-01`,
          parsedAt: new Date(),
        },
        async (candidates) => {
          const matched = matchFiraLines(parsedLines, candidates);
          const lines = parsedLines.map((line) => {
            const match = matched.find((match) => match.position === line.position);
            if (!match) throw new Error("FIRA match missing");
            return { ...line, ...match };
          });
          await files.put(fileKey, bytes, "application/pdf");
          return lines;
        },
      );
      if (!saved.ok) return c.json({ error: "fira_duplicate" }, 409);
      const document = (await listFiraDocuments(deps.db, userId)).find((doc) => doc.id === id);
      if (!document) throw new Error("FIRA lookup failed");
      return c.json(document, 201);
    },
  );
  for (const decision of ["confirm", "reject"] as const) {
    routes.post(`/fira/lines/:id/${decision}`, async (c) => {
      const userId = await readSession(c, deps.sessionSecret);
      if (!userId) return c.json({ error: "unauthenticated" }, 401);
      const lineId = z.uuid().safeParse(c.req.param("id"));
      if (!lineId.success) return c.json({ error: "not_found" }, 404);
      const body = await parseJsonBody(c, z.strictObject({}));
      if (!body.ok) return body.response;
      const result = await decideFiraMatch(deps.db, userId, lineId.data, decision);
      if (!result.ok)
        return result.reason === "not_found"
          ? c.json({ error: "not_found" }, 404)
          : c.json({ error: "no_suggestion" }, 409);
      return c.json(result.document);
    });
  }
  return routes;
}
