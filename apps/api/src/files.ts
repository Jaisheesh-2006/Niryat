import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { z } from "zod";
import type { FileStorageEnv } from "./env";

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
}

export function createS3FileStore(env: FileStorageEnv, fetcher?: typeof fetch): FileStore {
  const client = new AwsClient({
    accessKeyId: env.FILE_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.FILE_STORAGE_SECRET_ACCESS_KEY,
    region: env.FILE_STORAGE_REGION,
    service: "s3",
    retries: 2,
  });
  async function request(key: string, init: RequestInit) {
    const url = `${env.FILE_STORAGE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
    // Bound storage waits while invoice issuance holds the shared numbering lock.
    init = { ...init, signal: AbortSignal.timeout(15_000) };
    try {
      return await (fetcher ? fetcher(await client.sign(url, init)) : client.fetch(url, init));
    } catch {
      throw new Error("File storage request failed");
    }
  }
  return {
    async put(key, body, contentType) {
      const response = await request(key, {
        method: "PUT",
        body: new Uint8Array(body),
        headers: { "Content-Type": contentType },
      });
      if (!response.ok) throw new Error(`File storage request failed: ${response.status}`);
    },
    async get(key) {
      const response = await request(key, { method: "GET" });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`File storage request failed: ${response.status}`);
      try {
        return new Uint8Array(z.instanceof(ArrayBuffer).parse(await response.arrayBuffer()));
      } catch {
        throw new Error("File storage request failed");
      }
    },
  };
}

export const pdfKey = (userId: string, invoiceId: string) => `invoices/${userId}/${invoiceId}.pdf`;
export const newFileToken = () => randomBytes(32).toString("base64url");
