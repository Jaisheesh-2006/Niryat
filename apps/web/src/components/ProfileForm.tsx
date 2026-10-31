"use client";

import type { ProfileInput, PurposeCodeEntry } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { profileBody, sendJson } from "../lib/forms";

export function ProfileForm({
  initial,
  codes,
}: {
  initial: ProfileInput | null;
  codes: PurposeCodeEntry[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = profileBody(new FormData(event.currentTarget));
        setSubmitting(true);
        setMessage("");
        const result = await sendJson("/api/profile", "PUT", body);
        setSubmitting(false);
        if (result.ok) router.push("/health-check");
        else setMessage(result.message);
      }}
    >
      <fieldset>
        <legend>Are you registered for GST?</legend>
        <label htmlFor="gstRegistered-yes">Yes</label>
        <input
          id="gstRegistered-yes"
          name="gstRegistered"
          type="radio"
          value="yes"
          defaultChecked={initial?.gstRegistered === true}
          required
        />
        <label htmlFor="gstRegistered-no">No</label>
        <input
          id="gstRegistered-no"
          name="gstRegistered"
          type="radio"
          value="no"
          defaultChecked={initial?.gstRegistered === false}
          required
        />
      </fieldset>
      <label htmlFor="legalName">Legal name (as on your PAN or GST registration)</label>
      <input
        id="legalName"
        name="legalName"
        type="text"
        maxLength={200}
        defaultValue={initial?.legalName ?? ""}
      />
      <label htmlFor="address">Business address</label>
      <textarea id="address" name="address" maxLength={500} defaultValue={initial?.address ?? ""} />
      <label htmlFor="gstin">GSTIN</label>
      <input
        id="gstin"
        name="gstin"
        type="text"
        maxLength={15}
        defaultValue={initial?.gstin ?? ""}
      />
      <label htmlFor="lutNumber">LUT (FORM GST RFD-11) reference number</label>
      <input
        id="lutNumber"
        name="lutNumber"
        type="text"
        maxLength={64}
        defaultValue={initial?.lutNumber ?? ""}
      />
      <label htmlFor="lutValidFrom">LUT valid from</label>
      <input
        id="lutValidFrom"
        name="lutValidFrom"
        type="date"
        defaultValue={initial?.lutValidFrom ?? ""}
      />
      <label htmlFor="lutValidTo">LUT valid to</label>
      <input
        id="lutValidTo"
        name="lutValidTo"
        type="date"
        defaultValue={initial?.lutValidTo ?? ""}
      />
      <label htmlFor="expectedTurnoverInr">
        Expected turnover this financial year (₹, all businesses under your PAN)
      </label>
      <input
        id="expectedTurnoverInr"
        name="expectedTurnoverInr"
        type="number"
        min={0}
        step={1}
        defaultValue={initial?.expectedTurnoverInr ?? ""}
      />
      <label htmlFor="workType">What work do you do for foreign clients?</label>
      <textarea
        id="workType"
        name="workType"
        maxLength={200}
        defaultValue={initial?.workType ?? ""}
      />
      <label htmlFor="purposeCode">Purpose code set in your PayPal account</label>
      <select id="purposeCode" name="purposeCode" defaultValue={initial?.purposeCode ?? ""}>
        <option value="">Not set</option>
        {initial?.purposeCode && !codes.some(({ code }) => code === initial.purposeCode) && (
          <option value={initial.purposeCode}>{initial.purposeCode}</option>
        )}
        {codes.map(({ code, paypalLabel }) => (
          <option key={code} value={code}>
            {code} — {paypalLabel}
          </option>
        ))}
      </select>
      <label htmlFor="gstr1Frequency">How do you file GSTR-1?</label>
      <p id="gstr1Frequency-help">Only for GST-registered users.</p>
      <select
        id="gstr1Frequency"
        name="gstr1Frequency"
        aria-describedby="gstr1Frequency-help"
        defaultValue={initial?.gstr1Frequency ?? ""}
      >
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly (QRMP)</option>
        <option value="">Not sure</option>
      </select>
      <label htmlFor="specifiedProfession">
        Is your work a specified profession under the Income-tax Act 2025, such as information
        technology? Ask your CA if unsure.
      </label>
      <select
        id="specifiedProfession"
        name="specifiedProfession"
        defaultValue={
          initial?.specifiedProfession === true
            ? "yes"
            : initial?.specifiedProfession === false
              ? "no"
              : ""
        }
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
        <option value="">Not sure</option>
      </select>
      <label htmlFor="panLast4">Last 4 characters of PAN</label>
      <input
        id="panLast4"
        name="panLast4"
        type="text"
        maxLength={4}
        defaultValue={initial?.panLast4 ?? ""}
      />
      <button type="submit" disabled={submitting}>
        Save profile
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
