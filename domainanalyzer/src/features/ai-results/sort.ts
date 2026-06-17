export type SortDirection = "asc" | "desc";

export type SortState<Metric extends string> =
  | {
      metric: Metric;
      direction: SortDirection;
    }
  | null;

const isMissingNumber = (value: number | null | undefined) =>
  value == null || Number.isNaN(value);

const isMissingString = (value: string | null | undefined) =>
  value == null || value.trim().length === 0;

export const compareNumbers = (
  a: number | null | undefined,
  b: number | null | undefined,
  direction: SortDirection,
) => {
  const aMissing = isMissingNumber(a);
  const bMissing = isMissingNumber(b);

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  return direction === "asc" ? Number(a) - Number(b) : Number(b) - Number(a);
};

export const compareStrings = (
  a: string | null | undefined,
  b: string | null | undefined,
  direction: SortDirection,
) => {
  const aMissing = isMissingString(a);
  const bMissing = isMissingString(b);

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const comparison = String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
  });
  return direction === "asc" ? comparison : -comparison;
};

