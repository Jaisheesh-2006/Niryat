import { PDF_TEXT_PATTERN } from "@niryat/shared";
import { z } from "zod";

export function agentNoteSchema(max: number, min = 20) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(PDF_TEXT_PATTERN)
    .refine((text) => !/[\p{N}@<>]|http|www\./iu.test(text));
}
