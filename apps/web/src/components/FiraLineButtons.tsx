"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendJson } from "../lib/forms";

export function FiraLineButtons({ lineId }: { lineId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  async function submit(decision: "confirm" | "reject") {
    return startTransition(async () => {
      setMessage("");
      const result = await sendJson(`/api/fira/lines/${lineId}/${decision}`, "POST", {});
      if (result.ok) startTransition(() => router.refresh());
      else setMessage(result.message);
    });
  }

  return (
    <>
      <div className="button-row">
        <button
          type="button"
          className="btn"
          data-variant="primary"
          disabled={isPending}
          onClick={() => submit("confirm")}
        >
          Confirm match
        </button>
        <button
          type="button"
          className="btn"
          data-variant="secondary"
          disabled={isPending}
          onClick={() => submit("reject")}
        >
          Reject match
        </button>
      </div>
      {message && (
        <p role="alert" className="banner" data-tone="danger">
          {message}
        </p>
      )}
    </>
  );
}
