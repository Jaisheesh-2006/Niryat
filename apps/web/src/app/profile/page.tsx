import { profileInputSchema, purposeCodesResponseSchema } from "@niryat/shared";
import { ProfileForm } from "../../components/ProfileForm";
import { apiGet } from "../../lib/api";

export default async function Profile() {
  const [profile, catalogue] = await Promise.all([
    apiGet("/profile", profileInputSchema),
    apiGet("/purpose-codes", purposeCodesResponseSchema),
  ]);
  if (catalogue === null) throw new Error("Purpose codes unavailable");

  return (
    <>
      <h1>Compliance profile</h1>
      <ProfileForm initial={profile} codes={catalogue.codes} />
    </>
  );
}
