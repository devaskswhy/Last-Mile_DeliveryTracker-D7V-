"use client";

/**
 * The labelled input used by every auth form — sign in, register, forgot and
 * reset password. Extracted once a third caller needed it; two copies were a
 * coincidence, three would have been a pattern nobody wrote down.
 */
export function AuthField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  hint?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "type"
>) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-eyebrow uppercase text-ink-muted">{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-ink-line bg-ink-soft px-4 py-3.5 text-body text-ink-bright outline-none transition-colors duration-fast ease-signature placeholder:text-ink-muted/60 focus:border-signal"
      />
      {hint ? <span className="text-caption text-ink-muted">{hint}</span> : null}
    </label>
  );
}
