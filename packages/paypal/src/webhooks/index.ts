// Fail closed until the signature-verification feature is implemented.
export async function verifyWebhookSignature(_input: unknown): Promise<never> {
  throw new Error("PayPal webhook signature verification is not implemented.");
}
