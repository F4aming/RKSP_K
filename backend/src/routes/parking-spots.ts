import { FastifyInstance } from "fastify";
import { BookingStatus, Role } from "@prisma/client";
import { z } from "zod";
import { verifyRole } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";

const spotSchema = z.object({
  code: z.string().min(2),
  location: z.string().min(2),
  pricePerHour: z.number().positive(),
  isActive: z.boolean().optional()
});

export async function parkingSpotRoutes(app: FastifyInstance) {
  app.get("/parking-availability", async (request, reply) => {
    const parsed = z
      .object({
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        location: z.string().optional()
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation error", issues: parsed.error.issues });
    }
    const start = new Date(parsed.data.startTime);
    const end = new Date(parsed.data.endTime);
    if (end <= start) {
      return reply.status(400).send({ message: "endTime must be after startTime" });
    }

    const spots = await prisma.parkingSpot.findMany({
      where: {
        isActive: true,
        ...(parsed.data.location ? { location: parsed.data.location } : {})
      },
      select: { id: true, location: true, pricePerHour: true }
    });

    const spotIds = spots.map((s) => s.id);
    const overlapping =
      spotIds.length === 0
        ? []
        : await prisma.booking.findMany({
            where: {
              status: BookingStatus.ACTIVE,
              spotId: { in: spotIds },
              startTime: { lt: end },
              endTime: { gt: start }
            },
            select: { spotId: true }
          });
    const busy = new Set(overlapping.map((b) => b.spotId));

    type Agg = { total: number; free: number; minPrice: number };
    const byLoc = new Map<string, Agg>();
    for (const s of spots) {
      let agg = byLoc.get(s.location);
      if (!agg) {
        agg = { total: 0, free: 0, minPrice: Number(s.pricePerHour) };
        byLoc.set(s.location, agg);
      }
      agg.total++;
      if (!busy.has(s.id)) agg.free++;
      const p = Number(s.pricePerHour);
      if (p < agg.minPrice) agg.minPrice = p;
    }

    const list = [...byLoc.entries()]
      .map(([location, v]) => ({
        location,
        totalSpots: v.total,
        freeSpots: v.free,
        pricePerHour: v.minPrice.toFixed(2)
      }))
      .sort((a, b) => a.location.localeCompare(b.location, "ru"));

    if (parsed.data.location) {
      const row = list.find((x) => x.location === parsed.data.location);
      if (!row) {
        return reply.status(404).send({ message: "Площадка не найдена" });
      }
      return row;
    }
    return list;
  });

  app.get("/parking-spots", async (request) => {
    const query = z.object({ location: z.string().optional() }).safeParse(request.query);
    const where = query.success && query.data.location ? { location: query.data.location, isActive: true } : { isActive: true };
    return prisma.parkingSpot.findMany({ where });
  });

  app.post("/parking-spots", { preHandler: verifyRole([Role.ADMIN, Role.OPERATOR]) }, async (request, reply) => {
    const parsed = spotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation error", issues: parsed.error.issues });
    }
    const created = await prisma.parkingSpot.create({ data: parsed.data });
    return reply.status(201).send(created);
  });

  app.patch("/parking-spots/:id", { preHandler: verifyRole([Role.ADMIN, Role.OPERATOR]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = spotSchema.partial().safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ message: "Validation error" });
    }
    const updated = await prisma.parkingSpot.update({
      where: { id: params.data.id },
      data: body.data
    });
    return updated;
  });

  app.delete("/parking-spots/:id", { preHandler: verifyRole([Role.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation error" });
    }
    await prisma.parkingSpot.delete({ where: { id: params.data.id } });
    return reply.status(204).send();
  });
}
