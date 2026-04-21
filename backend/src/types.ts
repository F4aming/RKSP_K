import "@fastify/jwt";
import { Role } from "@prisma/client";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; role: Role; emailVerified?: boolean };
    user: { userId: string; role: Role; emailVerified?: boolean };
  }
}
