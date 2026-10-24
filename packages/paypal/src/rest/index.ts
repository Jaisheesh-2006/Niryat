// Typed transport boundary only. Implement OAuth, retries and zod responses per spec.
// Invoicing v2 and Disputes v1 are outside the Server SDK.
export interface PayPalRestClient {
  request<T>(
    path: `/v2/invoicing/${string}` | `/v1/customer/disputes${string}`,
    responseParser: (input: unknown) => T,
  ): Promise<T>;
}
