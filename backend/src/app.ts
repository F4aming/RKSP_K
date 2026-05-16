import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { authRoutes } from "./routes/auth.js";
import { parkingSpotRoutes } from "./routes/parking-spots.js";
import { bookingRoutes } from "./routes/bookings.js";
import { adminRoutes } from "./routes/admin.js";

export function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({ logger: options?.logger ?? true });

  app.register(cors, { origin: true });
  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret",
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" }
  });

  app.register(async (api) => {
    api.register(authRoutes, { prefix: "/api" });
    api.register(parkingSpotRoutes, { prefix: "/api" });
    api.register(bookingRoutes, { prefix: "/api" });
    api.register(adminRoutes, { prefix: "/api" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
