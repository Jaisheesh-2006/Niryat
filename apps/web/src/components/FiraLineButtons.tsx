"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../lib/forms";

export function FiraLineButtons({ lineId }: { lineId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(decision: "confirm" | "reject") {
    setSubmitting(true);
    setMessage("");
    const result = await sendJson(`/api/fira/lines/${lineId}/${decision}`, "POST", {});
    setSubmitting(false);
    if (result.ok) router.refresh();
    else setMessage(result.message);
  }

  return (
    <>
      <button type="button" disabled={submitting} onClick={() => submit("confirm")}>
        Confirm match
      </button>
      <button type="button" disabled={submitting} onClick={() => submit("reject")}>
        Reject match
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
