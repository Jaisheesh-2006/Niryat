"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { sendPdf } from "../lib/forms";

export function FiraUpload() {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <form
      className="card"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (form.get("consent") !== "on") {
          setMessage("Confirm that this is your own payment proof (FIRA) before uploading.");
          return;
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          setMessage(
            "Niryat could not read payment details from this PDF. Upload the digital payment proof (FIRA) PDF from PayPal, not a scan.",
          );
          return;
        }
        return startTransition(async () => {
          setMessage("");
          const result = await sendPdf("/api/fira", file);
          if (result.ok) startTransition(() => router.refresh());
          else setMessage(result.message);
        });
      }}
    >
      <label htmlFor={id}>Payment proof PDF (FIRA)</label>
      <input
        id={id}
        name="file"
        type="file"
        accept="application/pdf"
        aria-describedby={message ? `${id}-error` : undefined}
        required
      />
      <label>
        <input
          name="consent"
          type="checkbox"
          aria-describedby={message ? `${id}-error` : undefined}
          required
        />
        This is my own payment proof (FIRA). I consent to Niryat storing it.
      </label>
      <button type="submit" disabled={isPending}>
        {isPending ? "Reading…" : "Upload payment proof"}
      </button>
      {message && (
        <p id={`${id}-error`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
