import { describe, expect, it, vi } from "vitest";
import {
  getDispute,
  listUpdatedDisputeIds,
  PayPalApiError,
  type PayPalRestClient,
  toDisputeRecord,
} from "../index";

const dispute = {
  dispute_id: "PP-R-TBU-10194472",
  disputed_transactions: [{ seller_transaction_id: "CAPTURE123", invoice_number: "INV2-TEST" }],
  dispute_amount: { value: "50.00", currency_code: "USD" },
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  status: "WAITING_FOR_SELLER_RESPONSE",
  dispute_life_cycle_stage: "INQUIRY",
  seller_response_due_date: "2026-11-06T12:00:00.000Z",
  update_time: "2026-10-27T12:00:00.000Z",
};
const updatedAfter = "2026-10-20T12:00:00+05:30";
const nextHref =
  "https://api-m.sandbox.paypal.com/v1/customer/disputes?next_page_token=TOKEN%2B2&page_size=50";

function setup(...replies: unknown[]) {
  const read = vi.fn<(path: string) => Promise<unknown>>();
  for (const reply of replies) read.mockResolvedValueOnce(reply);
  const rest: Pick<PayPalRestClient, "get"> = {
    async get(path, parse) {
      return parse(await read(path));
    },
  };
  return { rest, read };
}

describe("toDisputeRecord", () => {
  it("maps the P4-1 detail fields and keeps an unresolved outcome null", () => {
    expect(toDisputeRecord(dispute)).toEqual({
      disputeId: "PP-R-TBU-10194472",
      captureIds: ["CAPTURE123"],
      amount: "50.00",
      currency: "USD",
      reason: dispute.reason,
      status: "WAITING_FOR_SELLER_RESPONSE",
      stage: "INQUIRY",
      outcome: null,
      responseDue: "2026-11-06T12:00:00.000Z",
      updateTime: "2026-10-27T12:00:00.000Z",
    });
  });

  it("maps outcome codes and all captures, with absent stage and due date null", () => {
    const { dispute_life_cycle_stage, seller_response_due_date, ...minimal } = dispute;
    expect(
      toDisputeRecord({
        ...minimal,
        dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" },
        disputed_transactions: [
          { seller_transaction_id: "CAPTURE123" },
          { seller_transaction_id: "CAPTURE456" },
        ],
      }),
    ).toMatchObject({
      captureIds: ["CAPTURE123", "CAPTURE456"],
      outcome: "RESOLVED_BUYER_FAVOUR",
      stage: null,
      responseDue: null,
    });
  });

  it.each([
    { ...dispute, dispute_amount: undefined },
    { ...dispute, dispute_amount: { value: 50, currency_code: "USD" } },
    { ...dispute, update_time: "private invalid timestamp" },
    { ...dispute, disputed_transactions: [{ buyer_transaction_id: "BUYER123" }] },
  ])("rejects malformed detail without exposing values", (input) => {
    expect(() => toDisputeRecord(input)).toThrow(/^Invalid dispute$/);
  });
});

describe("getDispute", () => {
  it("reads a validated dispute detail path", async () => {
    const { rest, read } = setup(dispute);
    await expect(getDispute(rest, dispute.dispute_id)).resolves.toEqual(toDisputeRecord(dispute));
    expect(read).toHaveBeenCalledExactlyOnceWith(`/v1/customer/disputes/${dispute.dispute_id}`);
  });

  it("returns null only for PayPal 404 errors", async () => {
    const { rest, read } = setup();
    read.mockRejectedValueOnce(new PayPalApiError(404, "RESOURCE_NOT_FOUND"));
    await expect(getDispute(rest, dispute.dispute_id)).resolves.toBeNull();
    const error = new PayPalApiError(403, "NOT_AUTHORIZED");
    read.mockRejectedValueOnce(error);
    await expect(getDispute(rest, dispute.dispute_id)).rejects.toBe(error);
  });

  it("rejects unsafe IDs without a request", async () => {
    const { rest, read } = setup();
    await expect(getDispute(rest, "../x")).rejects.toThrow(/^Invalid disputeId$/);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("listUpdatedDisputeIds", () => {
  it("encodes the timestamp and follows the next-page HATEOAS query", async () => {
    const { rest, read } = setup(
      { items: [{ dispute_id: dispute.dispute_id }], links: [{ rel: "next", href: nextHref }] },
      { items: [{ dispute_id: "PP-R-TBU-SECOND" }], links: [] },
    );
    await expect(listUpdatedDisputeIds(rest, updatedAfter)).resolves.toEqual([
      dispute.dispute_id,
      "PP-R-TBU-SECOND",
    ]);
    expect(read.mock.calls).toEqual([
      [`/v1/customer/disputes?update_time_after=${encodeURIComponent(updatedAfter)}&page_size=50`],
      ["/v1/customer/disputes?next_page_token=TOKEN%2B2&page_size=50"],
    ]);
  });

  it("accepts an empty final page", async () => {
    const { rest } = setup({ items: [] });
    await expect(listUpdatedDisputeIds(rest, updatedAfter)).resolves.toEqual([]);
  });

  it("accepts a links-only response when no disputes match", async () => {
    const { rest, read } = setup({
      links: [{ rel: "self", href: "https://api-m.sandbox.paypal.com/v1/customer/disputes" }],
    });
    await expect(listUpdatedDisputeIds(rest, updatedAfter)).resolves.toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid timestamp before a request", async () => {
    const { rest, read } = setup();
    await expect(listUpdatedDisputeIds(rest, "invalid")).rejects.toThrow(/^Invalid updatedAfter$/);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    "https://api-m.paypal.com/v1/customer/disputes?page=2",
    "https://untrusted.example/v1/customer/disputes?page=2",
    "https://api-m.sandbox.paypal.com/v2/invoicing/invoices",
    "https://user:password@api-m.sandbox.paypal.com/v1/customer/disputes?page=2",
  ])("rejects unsafe pagination links", async (href) => {
    const { rest, read } = setup({ items: [], links: [{ rel: "next", href }] });
    await expect(listUpdatedDisputeIds(rest, updatedAfter)).rejects.toThrow(
      /^Invalid dispute pagination link$/,
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, [{ dispute_id: "../private" }]])("rejects malformed items", async (items) => {
    const { rest } = setup({ items });
    await expect(listUpdatedDisputeIds(rest, updatedAfter)).rejects.toThrow(
      /^Invalid dispute list$/,
    );
  });

  it("stops at 20 pages without silently returning partial results", async () => {
    const { rest, read } = setup();
    read.mockResolvedValue({ items: [], links: [{ rel: "next", href: nextHref }] });
    await expect(listUpdatedDisputeIds(rest, updatedAfter)).rejects.toThrow(
      /^Too many dispute pages$/,
    );
    expect(read).toHaveBeenCalledTimes(20);
  });
});
