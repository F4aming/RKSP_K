import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { z } from "zod";

const roleSchema = z.enum(["DRIVER", "OPERATOR", "ADMIN"]);
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: roleSchema.optional()
});

describe("fuzz validation", () => {
  test("register schema never throws on random payload", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        const result = registerSchema.safeParse(payload);
        expect(typeof result.success).toBe("boolean");
      }),
      { numRuns: 500 }
    );
  });

  test("role model blocks invalid roles", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const parsed = roleSchema.safeParse(value);
        if (!["DRIVER", "OPERATOR", "ADMIN"].includes(value)) {
          expect(parsed.success).toBe(false);
        }
      }),
      { numRuns: 300 }
    );
  });
});
