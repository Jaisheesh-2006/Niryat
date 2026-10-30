import { paypalActionNames } from "@niryat/shared";
import { expect, it, vi } from "vitest";
import { actionStatusSchema, type ProposedAction, runApprovedAction } from "./index";

const action: ProposedAction = {
  id: "action-id",
  userId: "user-id",
  paypalAction: "send_invoice",
  payload: {},
  status: "approved",
};

function fakeStore(claimed: ProposedAction | undefined) {
  return {
    claim: vi.fn(async () => claimed),
    finish: vi.fn(async () => {}),
  };
}

function fakeHandlers() {
  return {
    send_invoice: vi.fn(async (_action: ProposedAction) => {}),
    create_recurring_series: vi.fn(async (_action: ProposedAction) => {}),
    refund_payment: vi.fn(async (_action: ProposedAction) => {}),
    send_invoice_reminder: vi.fn(async (_action: ProposedAction) => {}),
  };
}

it("limits action status to the planned approval lifecycle", () => {
  expect(actionStatusSchema.parse("proposed")).toBe("proposed");
  expect(actionStatusSchema.parse("failed")).toBe("failed");
  expect(actionStatusSchema.safeParse("auto-approved").success).toBe(false);
});

it("does not execute or finish an action the store refuses to claim", async () => {
  const store = fakeStore(undefined);
  const handlers = fakeHandlers();

  expect(await runApprovedAction(store, handlers, action.id, action.userId)).toEqual({
    ok: false,
    reason: "not_pending",
  });
  expect(store.claim).toHaveBeenCalledExactlyOnceWith(action.id, action.userId);
  expect(handlers.send_invoice).not.toHaveBeenCalled();
  expect(handlers.create_recurring_series).not.toHaveBeenCalled();
  expect(handlers.refund_payment).not.toHaveBeenCalled();
  expect(store.finish).not.toHaveBeenCalled();
});

it.each(paypalActionNames)(
  "executes the claimed %s action and finishes it",
  async (paypalAction) => {
    const claimed = { ...action, paypalAction };
    const store = fakeStore(claimed);
    const handlers = fakeHandlers();

    expect(await runApprovedAction(store, handlers, action.id, action.userId)).toEqual({
      ok: true,
    });
    expect(store.claim).toHaveBeenCalledExactlyOnceWith(action.id, action.userId);
    expect(handlers[paypalAction]).toHaveBeenCalledExactlyOnceWith(claimed);
    expect(
      Object.values(handlers).reduce((count, handler) => count + handler.mock.calls.length, 0),
    ).toBe(1);
    expect(store.finish).toHaveBeenCalledExactlyOnceWith(action.id, { status: "done" });
  },
);

it.each([
  { thrown: { code: "INVALID_REQUEST" }, error: "INVALID_REQUEST" },
  { thrown: new Error("secret value"), error: "unexpected_error" },
  { thrown: { code: 400, message: "secret value" }, error: "unexpected_error" },
  { thrown: null, error: "unexpected_error" },
])("finishes a handler failure with only $error", async ({ thrown, error }) => {
  const store = fakeStore(action);
  const handlers = fakeHandlers();
  handlers.send_invoice.mockRejectedValueOnce(thrown);

  expect(await runApprovedAction(store, handlers, action.id, action.userId)).toEqual({
    ok: false,
    reason: "failed",
    error,
  });
  expect(store.finish).toHaveBeenCalledExactlyOnceWith(action.id, { status: "failed", error });
});
