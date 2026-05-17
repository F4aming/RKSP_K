import nodemailer from "nodemailer";

export async function sendTransactionalEmail(to: string, subject: string, text: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    console.info(`[email:dev] to=${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_USER.length > 0
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@parking.local",
      to,
      subject,
      text
    });
  } catch (err) {
    console.error("[email] SMTP send failed:", err);
    console.info(`[email:fallback] to=${to}\nSubject: ${subject}\n\n${text}`);
  }
}
