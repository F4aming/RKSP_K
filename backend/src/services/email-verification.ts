import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../plugins/prisma.js";
import { sendTransactionalEmail } from "./email.js";

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueVerificationCode(
  userId: string,
  email: string,
  options?: { bypassCooldown?: boolean }
): Promise<{ sent: true } | { sent: false; retryAfterSec: number }> {
  const existing = await prisma.emailVerification.findUnique({ where: { userId } });
  if (
    !options?.bypassCooldown &&
    existing &&
    Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    const retryAfterSec = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - existing.createdAt.getTime())) / 1000
    );
    return { sent: false, retryAfterSec };
  }

  const plain = generateSixDigitCode();
  const codeHash = await bcrypt.hash(plain, 8);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.emailVerification.upsert({
    where: { userId },
    create: { userId, codeHash, expiresAt },
    update: { codeHash, expiresAt, createdAt: new Date() }
  });

  await sendTransactionalEmail(
    email,
    "Код подтверждения — парковки",
    `Ваш код подтверждения: ${plain}\n\nКод действует 15 минут. Если вы не регистрировались, проигнорируйте письмо.`
  );

  return { sent: true };
}

export async function verifyEmailCode(
  email: string,
  code: string
): Promise<{ ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "not_found" }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { emailVerification: true }
  });

  if (!user || !user.emailVerification) {
    return { ok: false, reason: "not_found" };
  }

  if (user.emailVerification.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const match = await bcrypt.compare(code.trim(), user.emailVerification.codeHash);
  if (!match) {
    return { ok: false, reason: "invalid" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() }
    }),
    prisma.emailVerification.delete({ where: { userId: user.id } })
  ]);

  return { ok: true, userId: user.id };
}
