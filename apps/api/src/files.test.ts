import { afterEach, expect, it, vi } from "vitest";
import type { FileStorageEnv } from "./env";
import { createS3FileStore, newFileToken, pdfKey } from "./files";

const env: FileStorageEnv = {
  FILE_STORAGE_URL: "https://storage.example/bucket",
  FILE_STORAGE_ACCESS_KEY_ID: "test-access-key",
  FILE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
  FILE_STORAGE_REGION: "auto",
};

afterEach(() => vi.unstubAllGlobals());

it("creates an unguessable URL-safe file token and the invoice object key", () => {
  const token = newFileToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(newFileToken()).not.toBe(token);
  expect(pdfKey("user-id", "invoice-id")).toBe("invoices/user-id/invoice-id.pdf");
});

it("signs a PUT with SigV4 and uploads the PDF bytes", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
  const body = new TextEncoder().encode("%PDF-test");
  await createS3FileStore(env, fetcher).put(
    pdfKey("user-id", "invoice-id"),
    body,
    "application/pdf",
  );
  const request = fetcher.mock.calls[0]?.[0];
  expect(request).toBeInstanceOf(Request);
  if (!(request instanceof Request)) throw new Error("Expected signed request");
  expect(request.url).toBe("https://storage.example/bucket/invoices/user-id/invoice-id.pdf");
  expect(request.method).toBe("PUT");
  expect(request.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(request.headers.get("Authorization")).toContain("/auto/s3/aws4_request");
  expect(request.headers.get("Content-Type")).toBe("application/pdf");
  expect(new Uint8Array(await request.arrayBuffer())).toEqual(body);
});

it("returns bytes on GET and undefined for a missing object", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(new Uint8Array([37, 80, 68, 70])))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  const store = createS3FileStore(env, fetcher);
  expect(await store.get("invoice.pdf")).toEqual(new Uint8Array([37, 80, 68, 70]));
  expect(await store.get("missing.pdf")).toBeUndefined();
  const request = fetcher.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error("Expected signed request");
  expect(request.method).toBe("GET");
  expect(request.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
});

it.each([403, 500])("reports only the storage status on failure (%s)", async (status) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response("private-provider-response", { status }));
  const store = createS3FileStore(env, fetcher);
  await expect(store.get("invoice.pdf")).rejects.toThrow(`File storage request failed: ${status}`);
  await expect(store.put("invoice.pdf", new Uint8Array(), "application/pdf")).rejects.toThrow(
    `File storage request failed: ${status}`,
  );
});

it("does not treat a PUT 404 as a successful upload", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
  await expect(
    createS3FileStore(env, fetcher).put("invoice.pdf", new Uint8Array(), "application/pdf"),
  ).rejects.toThrow("File storage request failed: 404");
});

it("sanitises network failures", async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private URL and credentials"));
  await expect(createS3FileStore(env, fetcher).get("invoice.pdf")).rejects.toThrow(
    /^File storage request failed$/,
  );
});

it("uses the AWS client's two retries in the default transport", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(createS3FileStore(env).get("invoice.pdf")).rejects.toThrow(
    "File storage request failed: 503",
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
});
