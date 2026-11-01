"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { sendJson } from "../lib/forms";

export function CloseButton() {
  const router = useRouter();
  const pending = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={async () => {
          if (pending.current || isPending) return;
          pending.current = true;
          return startTransition(async () => {
            setMessage("");
            const result = await sendJson("/api/close", "POST", {});
            pending.current = false;
            if (result.ok) startTransition(() => router.refresh());
            else setMessage(result.message);
          });
        }}
      >
        {isPending ? "Closing…" : "Close this month"}
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
