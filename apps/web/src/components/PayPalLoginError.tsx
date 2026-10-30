export function PayPalLoginError({ error }: { error: string | string[] | undefined }) {
  let message: string;
  switch (error) {
    case "paypal_cancelled":
      message = "PayPal sign-in was cancelled or expired. Try again.";
      break;
    case "paypal_failed":
      message =
        "PayPal couldn't sign you in. If this PayPal account runs this Niryat deployment, use email sign-in.";
      break;
    case "paypal_unavailable":
      message = "PayPal sign-in is unavailable. Try again later or use email sign-in.";
      break;
    case "email_taken":
      message = "An account already uses this email. Use email sign-in.";
      break;
    case "no_email":
      message = "PayPal did not provide an email address. Use email sign-up.";
      break;
    default:
      return null;
  }
  return <p role="alert">{message}</p>;
}
