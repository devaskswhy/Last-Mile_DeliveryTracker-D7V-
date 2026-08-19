import { Prisma } from "@prisma/client";

/**
 * Prisma returns `Decimal` objects for money and weight columns. Sending them
 * across the wire as JSON numbers would reintroduce the float rounding the
 * Decimal column exists to avoid, so they are serialised as strings and stay
 * strings all the way to the form field that renders them.
 */
export function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

type DecimalKeys<T> = {
  [K in keyof T]: T[K] extends Prisma.Decimal | null ? K : never;
}[keyof T];

/** Replaces the named Decimal fields of a row with their string form. */
export function serializeDecimals<T extends object, K extends DecimalKeys<T>>(
  row: T,
  keys: readonly K[],
): Omit<T, K> & { [P in K]: string | null } {
  const output = { ...row } as Record<string, unknown>;
  for (const k of keys) {
    output[k as string] = decimalToString(row[k] as Prisma.Decimal | null);
  }
  return output as Omit<T, K> & { [P in K]: string | null };
}
