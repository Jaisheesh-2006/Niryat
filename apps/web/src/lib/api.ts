import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { apiUrl } from "./env";

// Server components call the API directly and forward the browser's session cookie.
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<z.output<S> | null> {
  const cookie = (await headers()).get("cookie") ?? "";
  const response = await fetch(new URL(path, apiUrl), { headers: { cookie }, cache: "no-store" });
  if (response.status === 401) redirect("/login");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${path} failed with status ${response.status}`);
  return schema.parse(await response.json());
}
