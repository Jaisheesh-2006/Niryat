import { type Task, taskSchema } from "@niryat/shared";
import Link from "next/link";
import { z } from "zod";
import { TaskDoneButton } from "../../components/TaskDoneButton";
import { apiGet } from "../../lib/api";

export default async function Tasks() {
  const tasks = (await apiGet("/tasks", z.array(taskSchema))) ?? [];
  const openTasks = tasks.filter((task) => task.status === "open");
  const labels: Record<Task["type"], string> = {
    refund_recorded: "Refund recorded",
    dispute_opened: "Dispute opened",
    dispute_lost: "Dispute lost",
  };

  return (
    <>
      <h1>Tasks</h1>
      {openTasks.length === 0 && <p>No open tasks.</p>}
      {openTasks.map((task) => (
        <section key={task.id}>
          <h2>{labels[task.type]}</h2>
          <p>{task.message}</p>
          {task.dueDate && <p>Due {task.dueDate}</p>}
          {task.invoiceId && <Link href={`/invoices#invoice-${task.invoiceId}`}>Open invoice</Link>}
          <TaskDoneButton taskId={task.id} />
        </section>
      ))}
      <h2>Done</h2>
      <ul>
        {tasks
          .filter((task) => task.status === "done")
          .map((task) => (
            <li key={task.id}>
              {task.message} (done{" "}
              {task.doneAt
                ? new Date(task.doneAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
                : ""}
              )
            </li>
          ))}
      </ul>
    </>
  );
}
