import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../plugins/prisma.js";
import { Role } from "@prisma/client";
import { z } from "zod";
import { verifyAuth } from "../plugins/auth.js";
import { issueVerificationCode, verifyEmailCode } from "../services/email-verification.js";

/** Допускает любой непустой локальный ящик и домен с @ (без жёстких правил Zod email). */
const looseEmailSchema = z
  .string()
  .trim()
  .min(1, "Укажите почту")
  .max(320)
  .refine((s) => {
    const at = s.indexOf("@");
    if (at <= 0 || at === s.length - 1) return false;
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    return local.length > 0 && domain.length > 0 && !local.includes(" ") && !domain.includes(" ");
  }, "Формат: что-то@домен");

const registerSchema = z.object({
  email: looseEmailSchema,
  password: z.string().min(1, "Пароль не может быть пустым").max(256)
});

const verifyEmailSchema = z.object({
  email: looseEmailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Код из 6 цифр, как в письме")
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function signToken(
  app: FastifyInstance,
  user: { id: string; role: Role; emailVerifiedAt: Date | null }
): string {
  return app.jwt.sign(
    {
      userId: user.id,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt)
    },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" }
  );
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Ошибка валидации", issues: parsed.error.issues });
    }

    const email = normalizeEmail(parsed.data.email);
    const password = parsed.data.password;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) {
      return reply.status(409).send({ message: "Пользователь с такой почтой уже зарегистрирован" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (existing && !existing.emailVerifiedAt) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
      await issueVerificationCode(existing.id, email, { bypassCooldown: true });
      return reply.status(201).send({
        needsVerification: true,
        email,
        message: "Аккаунт обновлён. Код подтверждения отправлен на почту (см. также консоль сервера в режиме без SMTP)."
      });
    }

    const user = await prisma.user.create({
      data: { email, passwordHash, role: Role.DRIVER }
    });
    await issueVerificationCode(user.id, email, { bypassCooldown: true });

    return reply.status(201).send({
      needsVerification: true,
      email,
      message: "Код подтверждения отправлен на почту (в разработке без SMTP — код в логах бэкенда)."
    });
  });

  app.post("/auth/verify-email", async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Ошибка валидации", issues: parsed.error.issues });
    }

    const email = normalizeEmail(parsed.data.email);
    const result = await verifyEmailCode(email, parsed.data.code);

    if (!result.ok) {
      if (result.reason === "expired") {
        return reply.status(400).send({
          message: "Код устарел. Запросите новый.",
          code: "CODE_EXPIRED"
        });
      }
      return reply.status(400).send({
        message: "Неверный код или почта. Проверьте ввод.",
        code: "INVALID_CODE"
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, email: true, role: true, emailVerifiedAt: true }
    });
    if (!user?.emailVerifiedAt) {
      return reply.status(500).send({ message: "Не удалось завершить подтверждение" });
    }

    const token = signToken(app, user);
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, emailVerified: true }
    };
  });

  app.post("/auth/resend-verification", async (request, reply) => {
    const parsed = z.object({ email: looseEmailSchema }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Ошибка валидации", issues: parsed.error.issues });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await prisma.user.findUnique({ where: { email } });

    const okBody = {
      message:
        "Если аккаунт с этой почтой есть и ещё не подтверждён, мы отправили код (или он уже был недавно — подождите минуту)."
    };

    if (!user || user.emailVerifiedAt) {
      return okBody;
    }

    const issued = await issueVerificationCode(user.id, user.email, { bypassCooldown: false });
    if (!issued.sent) {
      return reply.status(429).send({
        message: `Повторная отправка через ${issued.retryAfterSec} с.`,
        code: "RESEND_COOLDOWN",
        retryAfterSec: issued.retryAfterSec
      });
    }

    return okBody;
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = z
      .object({
        email: looseEmailSchema,
        password: z.string().min(1)
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Ошибка валидации", issues: parsed.error.issues });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ message: "Неверная почта или пароль", code: "INVALID_CREDENTIALS" });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ message: "Неверная почта или пароль", code: "INVALID_CREDENTIALS" });
    }

    if (!user.emailVerifiedAt) {
      const issued = await issueVerificationCode(user.id, user.email, { bypassCooldown: false });
      return reply.status(403).send({
        message: issued.sent
          ? "Сначала подтвердите почту по коду из письма."
          : `Код уже был отправлен недавно. Введите его или подождите ${issued.retryAfterSec} с. и попробуйте снова / «Отправить код повторно».`,
        code: "EMAIL_NOT_VERIFIED",
        email: user.email
      });
    }

    const token = signToken(app, user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: true
      }
    };
  });

  app.post("/auth/logout", { preHandler: verifyAuth }, async (_request, reply) => {
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: verifyAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, email: true, role: true, emailVerifiedAt: true }
    });
    if (!user) {
      return reply.status(404).send({ message: "Пользователь не найден", code: "USER_NOT_FOUND" });
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt)
    };
  });

  app.delete("/auth/account", { preHandler: verifyAuth }, async (request, reply) => {
    const parsed = z
      .object({
        password: z.string().min(1, "Введите пароль для подтверждения удаления")
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Ошибка валидации", issues: parsed.error.issues });
    }

    const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
    if (!user) {
      return reply.status(404).send({ message: "Пользователь не найден", code: "USER_NOT_FOUND" });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ message: "Неверный пароль", code: "INVALID_PASSWORD" });
    }

    await prisma.user.delete({ where: { id: user.id } });
    return reply.status(204).send();
  });
}
