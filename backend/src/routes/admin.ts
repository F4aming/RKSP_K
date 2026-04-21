import { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyRole } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";
import { Role } from "@prisma/client";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/users", { preHandler: verifyRole([Role.ADMIN]) }, async () => {
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
        _count: { select: { bookings: true } }
      }
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      emailVerified: Boolean(u.emailVerifiedAt),
      createdAt: u.createdAt.toISOString(),
      bookingsCount: u._count.bookings
    }));
  });

  app.get("/admin/users/:userId/bookings", { preHandler: verifyRole([Role.ADMIN]) }, async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Некорректный идентификатор пользователя" });
    }

    const exists = await prisma.user.findUnique({
      where: { id: params.data.userId },
      select: { id: true, email: true }
    });
    if (!exists) {
      return reply.status(404).send({ message: "Пользователь не найден" });
    }

    const list = await prisma.booking.findMany({
      where: { userId: params.data.userId },
      include: { spot: true },
      orderBy: { startTime: "desc" }
    });

    return { user: exists, bookings: list };
  });
}
