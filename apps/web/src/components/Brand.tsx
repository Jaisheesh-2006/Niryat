import Link from "next/link";
import { BrandMark } from "./icons";

// Niryat (निर्यात) is Hindi for "export"; the Devanagari is decorative, so the link reads "Niryat".
export function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="brand-link">
      <BrandMark />
      <span className="brand-name">
        Niryat
        <span className="brand-hindi" lang="hi" aria-hidden="true">
          निर्यात
        </span>
      </span>
    </Link>
  );
}
