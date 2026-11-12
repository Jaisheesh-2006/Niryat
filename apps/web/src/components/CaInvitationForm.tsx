"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendJson, text } from "../lib/forms";

export function CaInvitationForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="card"
      method="post"
      aria-describedby={message ? "ca-invitation-error" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        const invitationCode = text(new FormData(event.currentTarget), "invitationCode");
        startTransition(async () => {
          setMessage("");
          const result = await sendJson("/api/ca/requests/claim", "POST", { invitationCode });
          if (result.ok) startTransition(() => router.refresh());
          else setMessage(result.message);
        });
      }}
    >
      <h2>Open an invitation</h2>
      <p>
        Ask your client to send you their invitation code privately. Sign in with the CA email they
        invited, then enter the code here to see their request.
      </p>
      <label htmlFor="invitationCode">Invitation code</label>
      <input
        id="invitationCode"
        name="invitationCode"
        type="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={101}
        required
        disabled={isPending}
      />
      <button type="submit" disabled={isPending}>
        {isPending ? "Opening…" : "Open request"}
      </button>
      {message && (
        <p id="ca-invitation-error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
