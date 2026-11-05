import Link from "next/link";
import { z } from "zod";
import { Gstr1Report, gstr1Messages, gstr1PreviewFor } from "../../../components/Gstr1Report";
import { PageHeader } from "../../../components/PageHeader";

export const metadata = { title: "GSTR-1" };

export default async function Gstr1({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = z.object({ period: z.string().optional() }).safeParse(await searchParams);
  const selected = query.success
    ? await gstr1PreviewFor(query.data.period)
    : { ok: false as const, message: gstr1Messages.invalid_period };
  if (!selected.ok)
    return (
      <>
        <PageHeader title="GSTR-1" />
        <p>{selected.message}</p>
        <Link href="/profile">Edit profile</Link>
        <p>
          <Link href="/gstr1">Use the latest closed period</Link>
        </p>
      </>
    );
  const { preview } = selected;
  return (
    <>
      <PageHeader title="GSTR-1" />
      <Gstr1Report preview={preview} />
    </>
  );
}
