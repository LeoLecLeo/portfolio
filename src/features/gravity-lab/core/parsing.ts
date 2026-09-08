export type DecimalParseFailureReason =
  | "missing"
  | "invalid-syntax"
  | "non-finite"
  | "underflow";

export type DecimalParseResult =
  | Readonly<{
      ok: true;
      value: number;
    }>
  | Readonly<{
      ok: false;
      reason: DecimalParseFailureReason;
    }>;

const DECIMAL_NUMBER_PATTERN =
  /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?$/u;
const EXPLICIT_NON_FINITE_PATTERN = /^[+-]?(?:NaN|Infinity)$/iu;

function hasNonZeroSignificandDigit(value: string): boolean {
  const exponentIndex = value.search(/[eE]/u);
  const significand =
    exponentIndex === -1 ? value : value.slice(0, exponentIndex);

  return /[1-9]/u.test(significand);
}

/**
 * Parses a complete decimal string. A single dot or comma is always a decimal
 * separator; grouping separators are intentionally unsupported.
 */
export function parseDecimalNumber(rawText: string): DecimalParseResult {
  const trimmedText = rawText.trim();

  if (trimmedText.length === 0) {
    return { ok: false, reason: "missing" };
  }

  if (EXPLICIT_NON_FINITE_PATTERN.test(trimmedText)) {
    return { ok: false, reason: "non-finite" };
  }

  if (!DECIMAL_NUMBER_PATTERN.test(trimmedText)) {
    return { ok: false, reason: "invalid-syntax" };
  }

  const value = Number(trimmedText.replace(",", "."));

  if (!Number.isFinite(value)) {
    return { ok: false, reason: "non-finite" };
  }

  if (value === 0 && hasNonZeroSignificandDigit(trimmedText)) {
    return { ok: false, reason: "underflow" };
  }

  return { ok: true, value };
}
