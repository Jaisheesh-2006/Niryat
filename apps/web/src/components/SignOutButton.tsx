"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../lib/forms";
import { LogOut } from "./icons";

export function SignOutButton({ loginPath = "/login" }: { loginPath?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        type="button"
        className="btn"
        data-variant="ghost"
        onClick={async () => {
          const result = await sendJson("/api/auth/logout", "POST", {});
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          router.push(loginPath);
          router.refresh();
        }}
      >
        <LogOut />
        Sign out
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
