import Link from "next/link";
import { appName } from "../index";

export default function Home() {
  return (
    <>
      <h1>{appName}</h1>
      <p>Export compliance for Indian freelancers paid through PayPal.</p>
      <p>
        <Link href="/signup">Create account</Link> or <Link href="/login">sign in</Link>.
      </p>
      {/* TODO: AG Studio dashboard and Bryntum Calendar; start trials on/after Nov 1. */}
    </>
  );
}
