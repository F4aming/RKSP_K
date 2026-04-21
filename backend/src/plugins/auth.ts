import { FastifyReply, FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function verifyAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: "Требуется аутентификация", code: "UNAUTHORIZED" });
  }

  const u = request.user;
  if (u.emailVerified === true) {
    return;
  }

  const row = await prisma.user.findUnique({
    where: { id: u.userId },
    select: { emailVerifiedAt: true }
  });

  if (row?.emailVerifiedAt) {
    return;
  }

  return reply.status(403).send({
    message:
      "Подтвердите адрес электронной почты: введите код из письма или запросите отправку повторно.",
    code: "EMAIL_NOT_VERIFIED"
  });
}

export function verifyRole(roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await verifyAuth(request, reply);
    if (reply.sent) return;
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.status(403).send({ message: "Недостаточно прав", code: "FORBIDDEN" });
    }
  };
}
