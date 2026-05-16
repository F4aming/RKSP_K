import { z } from "zod";

export const looseEmailSchema = z
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

export const registerSchema = z.object({
  email: looseEmailSchema,
  password: z.string().min(1, "Пароль не может быть пустым").max(256)
});

export const verifyEmailSchema = z.object({
  email: looseEmailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Код из 6 цифр, как в письме")
});

export const loginSchema = z.object({
  email: looseEmailSchema,
  password: z.string().min(1)
});

export const resendVerificationSchema = z.object({
  email: looseEmailSchema
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Введите пароль для подтверждения удаления")
});

export const bookingSchema = z
  .object({
    spotId: z.string().uuid().optional(),
    location: z.string().min(2).optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime()
  })
  .refine((data) => Boolean(data.spotId) !== Boolean(data.location), {
    message: "Укажите ровно одно из полей: spotId или location"
  });

export const spotSchema = z.object({
  code: z.string().min(2),
  location: z.string().min(2),
  pricePerHour: z.number().positive(),
  isActive: z.boolean().optional()
});

export const availabilityQuerySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  location: z.string().optional()
});

export const parkingSpotsQuerySchema = z.object({
  location: z.string().optional()
});

export const uuidParamSchema = z.object({
  id: z.string().uuid()
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid()
});
