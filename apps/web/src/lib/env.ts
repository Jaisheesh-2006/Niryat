import { z } from "zod";

export const apiUrl = z
  .url()
  .default("http://localhost:3001")
  .parse(process.env.API_URL || undefined);
