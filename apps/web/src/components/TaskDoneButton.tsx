"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendJson } from "../lib/forms";

export function TaskDoneButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        className="btn"
        data-variant="ghost"
        type="button"
        disabled={isPending}
        onClick={async () => {
          return startTransition(async () => {
            setMessage("");
            const result = await sendJson(`/api/tasks/${taskId}/done`, "POST", {});
            if (result.ok) startTransition(() => router.refresh());
            else setMessage(result.message);
          });
        }}
      >
        {isPending ? "Saving…" : "Mark done"}
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
