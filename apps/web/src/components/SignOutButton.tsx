"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../lib/forms";

export function SignOutButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await sendJson("/api/auth/logout", "POST", {});
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          router.push("/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
