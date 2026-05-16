import { BookingStatus, Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { verifyAuth, verifyRole } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";
import { bookingSchema, uuidParamSchema } from "../validation/schemas.js";

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

export async function bookingRoutes(app: FastifyInstance) {
  app.get("/bookings", { preHandler: verifyAuth }, async (request) => {
    if (request.user.role === Role.ADMIN || request.user.role === Role.OPERATOR) {
      return prisma.booking.findMany({ include: { user: true, spot: true } });
    }
    return prisma.booking.findMany({ where: { userId: request.user.userId }, include: { spot: true } });
  });

  app.post("/bookings", { preHandler: verifyRole([Role.DRIVER, Role.ADMIN]) }, async (request, reply) => {
    const parsed = bookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation error", issues: parsed.error.issues });
    }

    const start = new Date(parsed.data.startTime);
    const end = new Date(parsed.data.endTime);
    if (end <= start) {
      return reply.status(400).send({ message: "endTime must be after startTime" });
    }

    let spotId = parsed.data.spotId;

    if (parsed.data.location) {
      const atLocation = await prisma.parkingSpot.findMany({
        where: { location: parsed.data.location, isActive: true },
        select: { id: true }
      });
      if (atLocation.length === 0) {
        return reply.status(404).send({ message: "Площадка с таким адресом не найдена или неактивна" });
      }
      const busy = await prisma.booking.findMany({
        where: {
          status: BookingStatus.ACTIVE,
          spotId: { in: atLocation.map((s) => s.id) },
          startTime: { lt: end },
          endTime: { gt: start }
        },
        select: { spotId: true }
      });
      const busyIds = new Set(busy.map((b) => b.spotId));
      const free = atLocation.map((s) => s.id).filter((id) => !busyIds.has(id));
      const chosen = pickRandom(free);
      if (!chosen) {
        return reply
          .status(409)
          .send({ message: "На этой площадке нет свободных мест на выбранный интервал" });
      }
      spotId = chosen;
    }

    if (!spotId) {
      return reply.status(400).send({ message: "Не удалось определить место" });
    }

    const existing = await prisma.booking.findFirst({
      where: {
        spotId,
        status: BookingStatus.ACTIVE,
        startTime: { lt: end },
        endTime: { gt: start }
      }
    });

    if (existing) {
      return reply.status(409).send({ message: "Spot already booked for selected interval" });
    }

    const created = await prisma.booking.create({
      data: {
        spotId,
        startTime: start,
        endTime: end,
        userId: request.user.userId
      },
      include: { spot: true }
    });
    return reply.status(201).send(created);
  });

  app.patch("/bookings/:id/cancel", { preHandler: verifyAuth }, async (request, reply) => {
    const params = uuidParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation error" });
    }

    const booking = await prisma.booking.findUnique({ where: { id: params.data.id } });
    if (!booking) {
      return reply.status(404).send({ message: "Booking not found" });
    }

    const canCancel = request.user.role === Role.ADMIN || booking.userId === request.user.userId;
    if (!canCancel) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    return prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED }
    });
  });
}
