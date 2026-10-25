import {
  BANK_NOTE,
  type HealthFlag,
  type ProfileInput,
  type PurposeCodeEntry,
  type PurposeCodeSuggestion,
} from "@niryat/shared";
import { flag } from "./cite";
import type { RuleMetadata } from "./index";

export const PAYPAL_INDIA_PURPOSE_CODES: readonly PurposeCodeEntry[] = [
  {
    code: "P0104",
    paypalLabel: "Cross border delivery of goods and services",
    annexDescription:
      "Receipts against export of goods not covered by GR/PP/SOFTEX/EC copy of shipping bill (intermediary/transit trade)",
    suggest: "never",
  },
  {
    code: "P0301",
    paypalLabel: "Business related travel purchase",
    annexDescription: "Purchases towards travel (TCs, currency notes, TT/SWIFT transfers)",
    suggest: "never",
  },
  {
    code: "P0801",
    paypalLabel: "Hardware consulting",
    annexDescription: "Hardware consultancy/implementation",
    suggest: "yes",
  },
  {
    code: "P0802",
    paypalLabel: "Software consulting",
    annexDescription:
      "Software consultancy/implementation (other than those covered in SOFTEX form)",
    suggest: "yes",
  },
  {
    code: "P0803",
    paypalLabel: "Data processing consulting",
    annexDescription: "Data base, data processing charges",
    suggest: "yes",
  },
  {
    code: "P0805",
    paypalLabel: "Freelance journalism",
    annexDescription: "News agency services",
    suggest: "yes",
  },
  {
    code: "P0806",
    paypalLabel: "Other information services",
    annexDescription: "Other information services: subscription to newspapers, periodicals, etc.",
    suggest: "rarely",
  },
  {
    code: "P0902",
    paypalLabel: "Licensing revenues",
    annexDescription:
      "Receipts for use, through licensing, of produced originals or prototypes, patents, copyrights, trademarks, etc.",
    suggest: "yes",
  },
  {
    code: "P1004",
    paypalLabel: "Legal",
    annexDescription: "Legal services",
    suggest: "yes",
  },
  {
    code: "P1005",
    paypalLabel: "Accounting and tax",
    annexDescription: "Accounting, auditing, book keeping services",
    suggest: "yes",
  },
  {
    code: "P1006",
    paypalLabel: "Business and management consultancy",
    annexDescription: "Business and management consultancy and public relations services",
    suggest: "yes",
  },
  {
    code: "P1007",
    paypalLabel: "Advertising and market research",
    annexDescription: "Advertising, trade fair service",
    suggest: "yes",
  },
  {
    code: "P1008",
    paypalLabel: "Research and development",
    annexDescription: "Research & Development services",
    suggest: "yes",
  },
  {
    code: "P1009",
    paypalLabel: "Architectural services",
    annexDescription: "Architectural services",
    suggest: "yes",
  },
];

export const PURPOSE_CODE_HINTS: readonly {
  code: string | null;
  keywords: readonly string[];
  reason: string;
}[] = [
  {
    code: "P0802",
    keywords: [
      "software",
      "web development",
      "app development",
      "mobile app",
      "website",
      "programming",
      "saas",
      "devops",
      "frontend",
      "backend",
      "full stack",
    ],
    reason: "Software development and consulting are software consultancy/implementation (P0802).",
  },
  {
    code: "P0801",
    keywords: ["hardware", "embedded systems", "pcb design"],
    reason: "Hardware consulting and implementation is P0801.",
  },
  {
    code: "P0803",
    keywords: [
      "data entry",
      "data processing",
      "database",
      "data annotation",
      "data labelling",
      "data labeling",
    ],
    reason: "Database and data processing work is P0803.",
  },
  {
    code: "P0805",
    keywords: ["journalism", "journalist", "news"],
    reason: "Freelance journalism is news agency services (P0805).",
  },
  {
    code: "P0902",
    keywords: ["licensing", "license", "licence", "royalty", "royalties"],
    reason: "Licensing and royalty income is P0902.",
  },
  {
    code: "P1004",
    keywords: ["legal", "lawyer", "attorney", "contract drafting"],
    reason: "Legal services are P1004.",
  },
  {
    code: "P1005",
    keywords: ["accounting", "bookkeeping", "book keeping", "audit", "auditing", "tax"],
    reason:
      "Accounting, bookkeeping and audit are P1005. Tax consulting is Annex code P1015, which PayPal India does not offer, so P1005 is the nearest.",
  },
  {
    code: "P1006",
    keywords: [
      "management consulting",
      "business consulting",
      "business strategy",
      "public relations",
    ],
    reason: "Business and management consultancy and public relations are P1006.",
  },
  {
    code: "P1007",
    keywords: ["advertising", "marketing", "seo", "social media", "market research"],
    reason:
      "Advertising and marketing are P1007. Market research is Annex code P1016, which PayPal India does not offer, so P1007 is the nearest.",
  },
  {
    code: "P1008",
    keywords: ["research and development", "r&d"],
    reason: "Research and development services are P1008.",
  },
  {
    code: "P1009",
    keywords: ["architectural", "building design"],
    reason: "Architectural services are P1009.",
  },
  {
    code: null,
    keywords: [
      "civil engineering",
      "mechanical engineering",
      "electrical engineering",
      "structural engineering",
      "technical services",
    ],
    reason:
      "Engineering (Annex P1014) and other technical services (Annex P1022) have no PayPal India code. Ask your bank which offered code to use.",
  },
];

export function suggestPurposeCode(workType: string): PurposeCodeSuggestion {
  const text = workType.toLowerCase();
  const scored = PURPOSE_CODE_HINTS.map((hint) => ({
    hint,
    score: hint.keywords.filter((keyword) => new RegExp(`\\b${keyword}\\b`).test(text)).length,
  }));
  const best = Math.max(...scored.map(({ score }) => score));
  const matches = scored.filter(({ score }) => score === best);
  const [match] = matches;
  if (best === 0 || !match) {
    return {
      code: null,
      label: null,
      reason:
        "We could not match your work to a code PayPal India offers. Ask your bank which code to use.",
      note: BANK_NOTE,
    };
  }
  if (matches.length > 1) {
    return {
      code: null,
      label: null,
      reason:
        "Your work matches more than one service. Ask your bank which code fits your main work.",
      note: BANK_NOTE,
    };
  }
  return {
    code: match.hint.code,
    label:
      PAYPAL_INDIA_PURPOSE_CODES.find((entry) => entry.code === match.hint.code)?.paypalLabel ??
      null,
    reason: match.hint.reason,
    note: BANK_NOTE,
  };
}

export function checkPurposeCode(
  profile: Pick<ProfileInput, "purposeCode" | "workType">,
  rules: readonly RuleMetadata[],
): HealthFlag[] {
  const { purposeCode: code, workType } = profile;
  const entry = PAYPAL_INDIA_PURPOSE_CODES.find((entry) => entry.code === code);
  const flags: HealthFlag[] = [];
  if (code === null) {
    flags.push(
      flag(
        rules,
        "PURPOSE_CODES",
        "purpose_code_missing",
        "medium",
        "No purpose code saved. Add the purpose code set in your PayPal account.",
      ),
    );
  } else if (entry?.suggest === "never") {
    flags.push(
      flag(
        rules,
        "PURPOSE_CODES",
        "purpose_code_goods_or_travel",
        "high",
        `${code} (${entry.paypalLabel}) is not a services code. Its RBI description is: ${entry.annexDescription}`,
      ),
    );
  } else if (!entry) {
    flags.push(
      flag(
        rules,
        "PURPOSE_CODES",
        "purpose_code_not_offered",
        "high",
        `${code} is not one of the purpose codes PayPal India offers.`,
      ),
    );
  } else if (workType !== null) {
    const s = suggestPurposeCode(workType);
    if (s.code !== null && s.code !== code) {
      flags.push(
        flag(
          rules,
          "PURPOSE_CODES",
          "purpose_code_mismatch",
          "medium",
          `Your work looks like ${s.code} (${s.label}), but your purpose code is ${code} (${entry.paypalLabel}).`,
        ),
      );
    }
  }
  if (workType === null) {
    flags.push(
      flag(
        rules,
        "PURPOSE_CODES",
        "work_type_missing",
        "low",
        "Describe your work so we can check your purpose code.",
      ),
    );
  }
  return flags;
}
