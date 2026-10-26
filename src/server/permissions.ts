export function hasPermission(userId: string | undefined, permissions: string[] | undefined, required: string) {
  return Boolean(userId && permissions?.includes(required));
}
