import {
  caLinkResponseSchema,
  profileInputSchema,
  purposeCodesResponseSchema,
} from "@niryat/shared";
import { CaShareCard } from "../../../components/CaShareCard";
import { PageHeader } from "../../../components/PageHeader";
import { ProfileForm } from "../../../components/ProfileForm";
import { apiGet } from "../../../lib/api";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const [profile, catalogue, share] = await Promise.all([
    apiGet("/profile", profileInputSchema),
    apiGet("/purpose-codes", purposeCodesResponseSchema),
    apiGet("/ca-link", caLinkResponseSchema),
  ]);
  if (catalogue === null) throw new Error("Purpose codes unavailable");
  if (share === null) throw new Error("CA link unavailable");

  return (
    <>
      <PageHeader
        title="Your business profile"
        description="Add the details used to check your export invoices and payment records."
      />
      <ProfileForm initial={profile} codes={catalogue.codes} />
      <CaShareCard link={share.link} />
    </>
  );
}
