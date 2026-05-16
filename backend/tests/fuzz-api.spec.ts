import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import fc from "fast-check";
import { Role } from "@prisma/client";
import { mockBookingId, mockUserId } from "./helpers/mock-prisma.js";
import { authHeaderArb, jsonBodyArb, pathIdArb, queryArb } from "./helpers/fuzz-arbitraries.js";

vi.mock("../src/plugins/prisma.js", async () => {
  const { createMockPrisma } = await import("./helpers/mock-prisma.js");
  return { prisma: createMockPrisma() };
});
vi.mock("../src/services/email.js", () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue(undefined)
}));

import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

function assertNoCrash(statusCode: number) {
  expect(statusCode).toBeGreaterThanOrEqual(200);
  expect(statusCode).toBeLessThan(600);
  expect(statusCode).not.toBe(500);
}

describe("fuzz: HTTP API", () => {
  let app: FastifyInstance;
  let driverToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
    driverToken = app.jwt.sign({
      userId: mockUserId,
      role: Role.DRIVER,
      emailVerified: true
    });
    adminToken = app.jwt.sign({
      userId: mockUserId,
      role: Role.ADMIN,
      emailVerified: true
    });
  });

  afterAll(async () => {
    await app.close();
  });

  test("POST /api/auth/register — случайные тела", async () => {
    await fc.assert(
      fc.asyncProperty(jsonBodyArb(), async (body) => {
        const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: body });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 200 }
    );
  });

  test("POST /api/auth/login — случайные тела", async () => {
    await fc.assert(
      fc.asyncProperty(jsonBodyArb(), async (body) => {
        const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: body });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 200 }
    );
  });

  test("POST /api/auth/verify-email — случайные тела", async () => {
    await fc.assert(
      fc.asyncProperty(jsonBodyArb(), async (body) => {
        const res = await app.inject({ method: "POST", url: "/api/auth/verify-email", payload: body });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 200 }
    );
  });

  test("POST /api/auth/resend-verification — случайные тела", async () => {
    await fc.assert(
      fc.asyncProperty(jsonBodyArb(), async (body) => {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/resend-verification",
          payload: body
        });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 150 }
    );
  });

  test("GET /api/parking-availability — случайные query", async () => {
    await fc.assert(
      fc.asyncProperty(queryArb(), async (query) => {
        const res = await app.inject({ method: "GET", url: "/api/parking-availability", query });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 200 }
    );
  });

  test("GET /api/parking-spots — случайные query", async () => {
    await fc.assert(
      fc.asyncProperty(queryArb(), async (query) => {
        const res = await app.inject({ method: "GET", url: "/api/parking-spots", query });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 150 }
    );
  });

  test("POST /api/bookings — случайные тела и Authorization", async () => {
    await fc.assert(
      fc.asyncProperty(jsonBodyArb(), authHeaderArb(), async (body, auth) => {
        const headers = auth ? { authorization: auth } : {};
        const res = await app.inject({
          method: "POST",
          url: "/api/bookings",
          payload: body,
          headers
        });
        assertNoCrash(res.statusCode);
        if (!auth) expect([401, 415]).toContain(res.statusCode);
      }),
      { numRuns: 150 }
    );
  });

  test("PATCH /api/bookings/:id/cancel — случайный id и токен", async () => {
    await fc.assert(
      fc.asyncProperty(pathIdArb(), authHeaderArb(), async (id, auth) => {
        const headers = auth ? { authorization: auth } : { authorization: `Bearer ${driverToken}` };
        const res = await app.inject({
          method: "PATCH",
          url: `/api/bookings/${encodeURIComponent(id)}/cancel`,
          headers
        });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 150 }
    );
  });

  test("GET /api/bookings — случайный Authorization", async () => {
    await fc.assert(
      fc.asyncProperty(authHeaderArb(), async (auth) => {
        const headers = auth ? { authorization: auth } : {};
        const res = await app.inject({ method: "GET", url: "/api/bookings", headers });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 100 }
    );
  });

  test("POST /api/parking-spots — случайные тела (admin)", async () => {
    await fc.assert(
      fc.asyncProperty(jsonBodyArb(), async (body) => {
        const res = await app.inject({
          method: "POST",
          url: "/api/parking-spots",
          payload: body,
          headers: { authorization: `Bearer ${adminToken}` }
        });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 150 }
    );
  });

  test("GET /api/admin/users/:userId/bookings — случайный userId", async () => {
    await fc.assert(
      fc.asyncProperty(pathIdArb(), async (userId) => {
        const res = await app.inject({
          method: "GET",
          url: `/api/admin/users/${encodeURIComponent(userId)}/bookings`,
          headers: { authorization: `Bearer ${adminToken}` }
        });
        assertNoCrash(res.statusCode);
      }),
      { numRuns: 100 }
    );
  });

  test("GET /health — стабильный ответ", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  test("валидный JWT на /api/auth/me не даёт 500", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${driverToken}` }
    });
    assertNoCrash(res.statusCode);
    expect(res.statusCode).toBe(200);
  });

  test("отмена с валидным UUID в path", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/bookings/${mockBookingId}/cancel`,
      headers: { authorization: `Bearer ${driverToken}` }
    });
    assertNoCrash(res.statusCode);
    expect([200, 403, 404]).toContain(res.statusCode);
  });
});
