import { escapeHtml } from "@/lib/notifications/templates";
import { sendViaSmtp } from "@/lib/notifications/channels/smtp-client";

/**
 * The password-reset email.
 *
 * Sent directly through the low-level SMTP client rather than through
 * `notify()` — that dispatcher's whole shape (`NotifiableOrder`, order-status
 * events) is order code talking about an order. A password reset is account
 * code talking about an account; forcing it through the order-shaped
 * interface would mean either lying about having an order or widening that
 * interface until it stops describing anything in particular.
 */

function resetUrl(rawToken: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  rawToken: string,
): Promise<{ delivered: boolean; detail: string }> {
  const url = resetUrl(rawToken);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666">Last-Mile Delivery</p>
        <h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
        <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 12px">We received a request to reset the password for this account. This link is valid for one hour and can be used once.</p>
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Reset password</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;color:#666">If you did not request this, no action is needed — your password will not change unless you open the link above and choose a new one.</p>
        <p style="margin:0;font-size:12px;color:#666">${escapeHtml(url)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${name},`,
    "",
    "We received a request to reset the password for this account.",
    "This link is valid for one hour and can be used once.",
    "",
    url,
    "",
    "If you did not request this, no action is needed.",
  ].join("\n");

  const result = await sendViaSmtp({
    to,
    subject: "Reset your Last-Mile password",
    html,
    text,
  });

  return { delivered: result.delivered, detail: result.detail };
}
