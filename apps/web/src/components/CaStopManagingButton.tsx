"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendJson } from "../lib/forms";

export function CaStopManagingButton({
  freelancerId,
  linkId,
}: {
  freelancerId: string;
  linkId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        className="btn"
        data-variant="secondary"
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMessage("");
            const result = await sendJson(`/api/ca/clients/${freelancerId}/end`, "POST", {
              linkId,
            });
            if (result.ok) startTransition(() => router.push("/ca"));
            else setMessage(result.message);
          })
        }
      >
        Stop managing this client
      </button>
      {message && (
        <p role="alert" className="banner" data-tone="danger">
          {message}
        </p>
      )}
    </>
  );
}
