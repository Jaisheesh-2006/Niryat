import { type Task, taskSchema } from "@niryat/shared";
import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "../../../components/EmptyState";
import { ListChecks } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { TaskDoneButton } from "../../../components/TaskDoneButton";
import { Term } from "../../../components/Term";
import { apiGet } from "../../../lib/api";
import { formatDate } from "../../../lib/format";

export const metadata = { title: "Tasks" };

export default async function Tasks() {
  const tasks = (await apiGet("/tasks", z.array(taskSchema))) ?? [];
  const openTasks = tasks.filter((task) => task.status === "open");
  const labels: Record<Task["type"], string> = {
    refund_recorded: "Refund recorded",
    dispute_opened: "Dispute opened",
    dispute_lost: "Dispute lost",
    fira_missing: "Payment proof missing",
    rbi_deadline_passed: "RBI deadline passed",
    agent_suggestion: "Suggested by Claude",
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Review what needs your attention and mark each task done after you handle it."
      />
      <details>
        <summary>What these task terms mean</summary>
        <p>
          <Term term="fira" />
        </p>
        <p>
          <Term term="realisation" />
        </p>
        <p>
          <Term term="credit_note" />
        </p>
      </details>
      {openTasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="No open tasks">
          Niryat adds tasks when a refund, dispute, payment proof or deadline needs your attention.
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Due date</th>
                <th scope="col">Task</th>
                <th scope="col">Source rule</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {openTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.dueDate ? formatDate(task.dueDate) : "—"}</td>
                  <td>
                    <strong>{labels[task.type]}</strong>
                    <p>{task.message}</p>
                  </td>
                  <td className="mono">{task.sourceRuleId ?? "—"}</td>
                  <td>
                    <StatusBadge tone="neutral">Open</StatusBadge>
                  </td>
                  <td>
                    {task.invoiceId && (
                      <Link
                        className="btn"
                        data-variant="ghost"
                        href={`/invoices#invoice-${task.invoiceId}`}
                      >
                        Open invoice
                      </Link>
                    )}
                    <TaskDoneButton taskId={task.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="card">
        <summary>Done</summary>
        <ul>
          {tasks
            .filter((task) => task.status === "done")
            .map((task) => (
              <li key={task.id}>
                {task.message} (done {task.doneAt ? formatDate(task.doneAt) : ""})
              </li>
            ))}
        </ul>
      </details>
    </>
  );
}
