export const getIpAddress = (
  headerValue: string | undefined,
): string | null => {
  if (!headerValue) return null;
  const parts = headerValue.split(",");
  const first = parts[0];
  return first ? first.trim() : null;
};
