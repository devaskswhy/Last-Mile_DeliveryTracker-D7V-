import { z } from "zod";

/**
 * Numeric input for Prisma `Decimal` columns.
 *
 * Values are validated as strings and handed to Prisma as strings, never as
 * JavaScript numbers. `0.1 + 0.2` is the reason: binary floats cannot represent
 * most decimal fractions exactly, and money that round-trips through a `number`
 * accumulates error. The string path is exact end to end.
 */
interface DecimalOptions {
  /** Digits allowed after the decimal point; must match the column's scale. */
  scale: number;
  min?: number;
  max?: number;
  /** Reject exactly zero (e.g. a per-kg slab of 0 kg). */
  positive?: boolean;
}

export function decimalInput(label: string, options: DecimalOptions) {
  const { scale, min = 0, max, positive = false } = options;
  const pattern = new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`);

  return z
    .union([z.string(), z.number()], {
      // Without this, an omitted field reports Zod's generic "Invalid input",
      // which tells an admin nothing about which value is missing.
      error: `${label} is required`,
    })
    .transform((value) =>
      typeof value === "number" ? String(value) : value.trim(),
    )
    .superRefine((value, ctx) => {
      if (value === "") {
        ctx.addIssue({ code: "custom", message: `${label} is required` });
        return;
      }
      if (!pattern.test(value)) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be a number with at most ${scale} decimal place${scale === 1 ? "" : "s"}`,
        });
        return;
      }

      const numeric = Number(value);
      if (numeric < min) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be at least ${min}`,
        });
      }
      if (positive && numeric === 0) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be greater than 0`,
        });
      }
      if (max !== undefined && numeric > max) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be at most ${max}`,
        });
      }
    });
}

/** Currency amount — two decimals, matching `@db.Decimal(10, 2)`. */
export const currency = (label: string, max = 99_999_999.99) =>
  decimalInput(label, { scale: 2, min: 0, max });

/** Weight in kg — three decimals, matching `@db.Decimal(10, 3)`. */
export const weightKg = (label: string, positive = false) =>
  decimalInput(label, { scale: 3, min: 0, max: 9_999_999.999, positive });

/** Percentage, 0–100 — two decimals, matching `@db.Decimal(5, 2)`. */
export const percentage = (label: string) =>
  decimalInput(label, { scale: 2, min: 0, max: 100 });
