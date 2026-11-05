"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendJson } from "../lib/forms";

export function CaRequestButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="approval-controls">
        {(["accept", "decline"] as const).map((response) => (
          <button
            key={response}
            className="btn"
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setMessage("");
                const result = await sendJson(
                  `/api/ca/requests/${requestId}/${response}`,
                  "POST",
                  {},
                );
                if (result.ok) startTransition(() => router.refresh());
                else setMessage(result.message);
              })
            }
          >
            {response === "accept" ? "Accept" : "Decline"}
          </button>
        ))}
      </div>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
