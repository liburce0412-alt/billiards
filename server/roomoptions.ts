export function sanitiseRoomOptions(
  input: Record<string, unknown>,
  _role: "user" | "moderator" | "admin",
  _userId: string
): Record<string, unknown> {
  const options = { ...input }
  // Assistance is an account capability evaluated only by the owner's client.
  // Room metadata must neither grant it nor reveal it to other participants.
  delete options.adminDemoRequested
  delete options.adminDemoRoom
  delete options.adminDemoOwnerId
  return options
}
