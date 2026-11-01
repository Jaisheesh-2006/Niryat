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
      <button type="button" disabled={isPending} onClick={() => submit("confirm")}>
        Confirm match
      </button>
      <button type="button" disabled={isPending} onClick={() => submit("reject")}>
        Reject match
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
