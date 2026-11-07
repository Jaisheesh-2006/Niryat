"use client";

import { taskPlanInputSchema, taskSchema } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendJson, text } from "../lib/forms";

export function TaskPlanForm({
  taskId,
  plannedDate,
}: {
  taskId: string;
  plannedDate: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <form
      className="task-plan"
      onSubmit={(event) => {
        event.preventDefault();
        const input = taskPlanInputSchema.safeParse({
          plannedDate: text(new FormData(event.currentTarget), "plannedDate"),
        });
        if (!input.success) {
          setMessage("Enter a valid planned date.");
          return;
        }
        startTransition(async () => {
          setMessage("");
          const result = await sendJson(
            `/api/tasks/${taskId}/plan`,
            "POST",
            input.data,
            taskSchema,
          );
          if (result.ok) {
            setMessage("Planned date saved.");
            router.refresh();
          } else setMessage(result.message);
        });
      }}
    >
      <label htmlFor={`plan-${taskId}`}>Planned work date</label>
      <input
        key={plannedDate ?? ""}
        id={`plan-${taskId}`}
        name="plannedDate"
        type="date"
        defaultValue={plannedDate ?? ""}
        disabled={isPending}
      />
      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save plan"}
      </button>
      <p>Leave blank to clear. The due date stays unchanged.</p>
      <p role="status">{message}</p>
    </form>
  );
}
