import { profileInputSchema, purposeCodesResponseSchema } from "@niryat/shared";
import { PageHeader } from "../../../components/PageHeader";
import { ProfileForm } from "../../../components/ProfileForm";
import { apiGet } from "../../../lib/api";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const [profile, catalogue] = await Promise.all([
    apiGet("/profile", profileInputSchema),
    apiGet("/purpose-codes", purposeCodesResponseSchema),
  ]);
  if (catalogue === null) throw new Error("Purpose codes unavailable");

  return (
    <>
      <PageHeader title="Compliance profile" />
      <ProfileForm initial={profile} codes={catalogue.codes} />
    </>
  );
}
