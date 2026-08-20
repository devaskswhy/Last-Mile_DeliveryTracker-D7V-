import { ok } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";

/**
 * TEMPORARY — diagnoses why SMTP delivery is not reaching a real inbox on the
 * deployed environment, when the failure is invisible from outside because
 * forgot-password deliberately never reveals delivery outcome in its
 * response. ADMIN-gated so it is not a public information-leak surface even
 * temporarily. Delete this file once the real cause is known.
 */
export async function GET() {
  return adminRoute(async () => {
    const env = {
      SMTP_HOST: process.env.SMTP_HOST || null,
      SMTP_PORT: process.env.SMTP_PORT || null,
      SMTP_USER: process.env.SMTP_USER
        ? process.env.SMTP_USER.replace(/(?<=.{3}).(?=.*@)/g, "*")
        : null,
      SMTP_PASS_length: process.env.SMTP_PASS?.length ?? 0,
      NODE_ENV: process.env.NODE_ENV,
    };

    let verifyResult: { ok: boolean; error?: string } = { ok: false };
    let sendResult: { ok: boolean; error?: string; messageId?: string } = {
      ok: false,
    };

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 8000,
      });

      try {
        await transporter.verify();
        verifyResult = { ok: true };
      } catch (error) {
        verifyResult = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        const info = await transporter.sendMail({
          from: `"Last-Mile Diagnostic" <${process.env.SMTP_USER}>`,
          to: `lastmile-diag-${Date.now()}@mailinator.com`,
          subject: "diagnostic",
          text: "diagnostic",
        });
        sendResult = { ok: true, messageId: info.messageId };
      } catch (error) {
        sendResult = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } catch (error) {
      verifyResult = {
        ok: false,
        error: `module load failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return ok({ env, verify: verifyResult, send: sendResult });
  });
}
