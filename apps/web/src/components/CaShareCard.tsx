"use client";

import { type CaLink, caLinkCreatedSchema } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate } from "../lib/format";
import { sendJson, text } from "../lib/forms";

export function CaShareCard({ link }: { link: CaLink | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState<{ linkId: string; code: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const active = link?.status === "pending" || link?.status === "accepted";

  return (
    <section className="card" aria-labelledby="ca-share-heading">
      <p className="eyebrow">Your CA</p>
      <h2 id="ca-share-heading">Share your records with your CA</h2>
      <p>
        Your CA will see your invoices, payments, deadlines and reports. They cannot send anything
        from your PayPal or approve actions. You can stop sharing at any time.
      </p>
      {link?.status === "pending" && (
        <>
          <p>
            Waiting for {link.caEmail} to accept. Ask them to sign in to Niryat as a CA with this
            email.
          </p>
          <p>
            Ask your CA to open Client requests and enter the invitation code. Share it privately
            with the CA you intend to invite.
          </p>
          {invitation?.linkId === link.id ? (
            <>
              <label htmlFor="ca-invitation-code">Invitation code (shown once)</label>
              <textarea
                id="ca-invitation-code"
                readOnly
                value={invitation.code}
                spellCheck={false}
              />
            </>
          ) : (
            <p>
              The invitation code was shown when you created this request. If you did not save it,
              cancel this request and send a new one.
            </p>
          )}
        </>
      )}
      {link?.status === "accepted" && link.respondedAt && (
        <p>
          Shared with {link.caEmail} since{" "}
          <time dateTime={link.respondedAt}>{formatDate(link.respondedAt)}</time>.
        </p>
      )}
      <form
        method="post"
        aria-describedby={message ? "ca-share-error" : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          const body = active
            ? { linkId: link.id }
            : { caEmail: text(new FormData(event.currentTarget), "caEmail") };
          startTransition(async () => {
            setMessage("");
            const result = active
              ? await sendJson("/api/ca-link/end", "POST", body)
              : await sendJson("/api/ca-link", "POST", body, caLinkCreatedSchema);
            if (result.ok) {
              setInvitation(
                result.data
                  ? { linkId: result.data.link.id, code: result.data.invitationCode }
                  : null,
              );
              startTransition(() => router.refresh());
            } else setMessage(result.message);
          });
        }}
      >
        {!active && (
          <>
            <label htmlFor="caEmail">Your CA's email</label>
            <input
              id="caEmail"
              name="caEmail"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
            />
          </>
        )}
        <button
          type="submit"
          className={active ? "btn" : undefined}
          data-variant={active ? "secondary" : undefined}
          disabled={isPending}
        >
          {isPending
            ? "Saving…"
            : link?.status === "pending"
              ? "Cancel request"
              : link?.status === "accepted"
                ? "Stop sharing"
                : "Send request"}
        </button>
        {message && (
          <p id="ca-share-error" role="alert" className="banner" data-tone="danger">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
