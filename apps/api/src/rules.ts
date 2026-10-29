import { readFileSync } from "node:fs";
import { parseRules, RULES_FILE_URL } from "@niryat/rules";

export const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
export const indiaDate = (instant: string | Date) =>
  new Date(instant).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const todayInIndia = () => indiaDate(new Date());
