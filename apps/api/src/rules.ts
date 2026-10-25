import { readFileSync } from "node:fs";
import { parseRules, RULES_FILE_URL } from "@niryat/rules";

export const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
export const todayInIndia = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
