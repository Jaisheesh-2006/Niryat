"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../lib/forms";

export function TaskDoneButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        type="button"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          setMessage("");
          const result = await sendJson(`/api/tasks/${taskId}/done`, "POST", {});
          setSubmitting(false);
          if (result.ok) router.refresh();
          else setMessage(result.message);
        }}
      >
        {submitting ? "Saving…" : "Mark done"}
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
