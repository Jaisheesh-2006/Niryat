"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { sendJson } from "../lib/forms";

export function CloseButton() {
  const router = useRouter();
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        type="button"
        disabled={submitting}
        onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setSubmitting(true);
          setMessage("");
          const result = await sendJson("/api/close", "POST", {});
          pending.current = false;
          setSubmitting(false);
          if (result.ok) router.refresh();
          else setMessage(result.message);
        }}
      >
        {submitting ? "Closing…" : "Close this month"}
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
