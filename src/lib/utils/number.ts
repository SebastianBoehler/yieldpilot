export function formatUnitsToNumber(value: bigint, decimals: number) {
  const scaled = Number(value) / 10 ** decimals;
  return Number.isFinite(scaled) ? scaled : 0;
}

export function safePercent(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [];
}

export function parseJsonNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is number => typeof entry === "number");
  }

  return [];
}

export function parseJsonRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === "number"),
  );
}

export function asErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
