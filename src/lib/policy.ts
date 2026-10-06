/**
 * Authorize mutations on the server. Never trust a client-sent user id or role.
 */
export async function can(input: {
  action: string;
  resource?: string;
}): Promise<boolean> {
  void input;
  throw new Error("Policy checks are not implemented yet.");
}
