import Link from "next/link";
import { BrandMark } from "./icons";

// Neel wordmark: CSS sets it lowercase; the link still reads "Niryat".
export function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="brand-link">
      <BrandMark />
      <span className="brand-name">Niryat</span>
    </Link>
  );
}
