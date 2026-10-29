"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { sendPdf } from "../lib/forms";

export function FiraUpload() {
  const id = useId();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (form.get("consent") !== "on") {
          setMessage("Confirm that this is your own FIRA before uploading.");
          return;
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          setMessage(
            "Niryat could not read FIRA lines from this PDF. Upload the digital FIRA PDF from PayPal, not a scan.",
          );
          return;
        }
        setSubmitting(true);
        setMessage("");
        const result = await sendPdf("/api/fira", file);
        setSubmitting(false);
        if (result.ok) router.refresh();
        else setMessage(result.message);
      }}
    >
      <label htmlFor={id}>FIRA PDF</label>
      <input id={id} name="file" type="file" accept="application/pdf" required />
      <label>
        <input name="consent" type="checkbox" required />
        This is my own FIRA. I consent to Niryat storing it.
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? "Reading…" : "Upload FIRA"}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
