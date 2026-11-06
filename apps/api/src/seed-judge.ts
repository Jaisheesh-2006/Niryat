import { parseEnv } from "@niryat/config";
import { createDb, type Db, parseEncryptionKey, seedJudgeRecords } from "@niryat/db";
import { checkExportConditions, financialYear, invoiceNumberFor } from "@niryat/rules";
import { JUDGE_EMAILS, profileInputSchema } from "@niryat/shared";
import { z } from "zod";
import { indiaDate, rules } from "./rules";

export async function seedJudge(db: Db, key: Buffer, buyerEmail: string, now: Date): Promise<void> {
  const email = z.email().parse(buyerEmail);
  const today = indiaDate(now);
  const day = (offset: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const fy = financialYear(today).slice(0, 4);
  const profile = profileInputSchema.parse({
    legalName: "Ananya Rao",
    address: "Synthetic demo address, Pune, India",
    gstRegistered: true,
    gstin: "27ABCDE1234F1Z5",
    lutNumber: "DEMO-LUT",
    lutValidFrom: `${fy}-04-01`,
    lutValidTo: day(15),
    workType: "Software development",
    purposeCode: "P1006",
    panLast4: "234F",
    expectedTurnoverInr: 1200000,
    gstr1Frequency: "monthly",
    specifiedProfession: true,
  });
  const answers = {
    supplierInIndia: true,
    clientPresentInIndia: false,
    paidInForeignCurrency: true,
    sameEstablishment: false,
  };
  const client = {
    name: "US sandbox demo client",
    country: "US",
    exportCheckResult: {
      answers,
      result: checkExportConditions({ country: "US", answers }, { today, rules }),
    },
  };
  await seedJudgeRecords(
    db,
    key,
    {
      now,
      buyerEmail: email,
      accounts: [
        {
          email: JUDGE_EMAILS.freelancer,
          name: "Ananya Rao",
          offsets: [-40, -10, 0],
          unpaidDate: day(-240),
        },
        {
          email: "judge-freelancer-2@niryat.test",
          name: "Meera Shah",
          offsets: [0],
          unpaidDate: null,
        },
        {
          email: "judge-freelancer-3@niryat.test",
          name: "Arjun Sen",
          offsets: [-10],
          unpaidDate: day(-730),
        },
      ].map((account, index) => ({
        email: account.email,
        profile:
          index === 0
            ? profile
            : {
                ...profile,
                legalName: account.name,
                purposeCode: "P0802",
                lutValidTo: `${Number(fy) + 1}-03-31`,
              },
        unpaidDate: account.unpaidDate,
        ledger: {
          client,
          items: account.offsets.map((offset, position) => ({
            date: day(offset),
            currency: "USD",
            amount: "1000.00",
            sac: "998314",
            description: "Synthetic software development invoice",
            paypalTxnId: `JUDGE-SYNTHETIC-${index}-${position}`,
            receivedAt: new Date(`${day(offset)}T12:00:00+05:30`),
          })),
        },
      })),
    },
    invoiceNumberFor,
  );
}

export async function main(): Promise<void> {
  try {
    const env = parseEnv(
      z.object({
        JUDGE_MODE: z.literal("true"),
        JUDGE_BUYER_EMAIL: z.email(),
        DATABASE_URL: z.url(),
        ENCRYPTION_KEY: z.string().min(1),
      }),
      process.env,
    );
    const key = parseEncryptionKey(env.ENCRYPTION_KEY);
    const database = createDb(env.DATABASE_URL);
    try {
      await seedJudge(database.db, key, env.JUDGE_BUYER_EMAIL, new Date());
      console.log(
        "Judge accounts ready: three freelancers and one CA. Synthetic history; shared accounts.",
      );
    } finally {
      await database.close();
    }
  } catch {
    console.error(
      "Judge seed failed; check JUDGE_MODE, JUDGE_BUYER_EMAIL, DATABASE_URL, ENCRYPTION_KEY and reserved demo accounts.",
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
