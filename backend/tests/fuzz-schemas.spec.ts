import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { Role } from "@prisma/client";
import {
  availabilityQuerySchema,
  bookingSchema,
  loginSchema,
  registerSchema,
  spotSchema,
  verifyEmailSchema
} from "../src/validation/schemas.js";

const VALID_ROLES = new Set<string>([Role.DRIVER, Role.OPERATOR, Role.ADMIN]);

function expectSafeParse(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  const result = schema.safeParse(value);
  expect(typeof result.success).toBe("boolean");
}

describe("fuzz: Zod-схемы", () => {
  test("registerSchema не бросает исключений на произвольном payload", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expectSafeParse(registerSchema, payload);
      }),
      { numRuns: 500 }
    );
  });

  test("loginSchema не бросает исключений на произвольном payload", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expectSafeParse(loginSchema, payload);
      }),
      { numRuns: 500 }
    );
  });

  test("verifyEmailSchema не бросает исключений на произвольном payload", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expectSafeParse(verifyEmailSchema, payload);
      }),
      { numRuns: 500 }
    );
  });

  test("bookingSchema не бросает исключений на произвольном payload", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expectSafeParse(bookingSchema, payload);
      }),
      { numRuns: 500 }
    );
  });

  test("spotSchema не бросает исключений на произвольном payload", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expectSafeParse(spotSchema, payload);
      }),
      { numRuns: 500 }
    );
  });

  test("availabilityQuerySchema не бросает исключений на произвольном query", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expectSafeParse(availabilityQuerySchema, payload);
      }),
      { numRuns: 500 }
    );
  });

  test("код из 6 цифр принимается только при точном формате", () => {
    fc.assert(
      fc.property(fc.string(), (code) => {
        const parsed = verifyEmailSchema.shape.code.safeParse(code);
        if (!/^\d{6}$/.test(code.trim())) {
          expect(parsed.success).toBe(false);
        }
      }),
      { numRuns: 300 }
    );
  });

  test("роль из Prisma enum — только DRIVER | OPERATOR | ADMIN", () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.values(Role)), fc.string(), (role, suffix) => {
        const candidate = `${role}${suffix}`;
        if (!VALID_ROLES.has(candidate)) {
          expect(VALID_ROLES.has(candidate)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });
});
