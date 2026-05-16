import fc from "fast-check";

/** Случайный JSON-подобный payload для тел запросов. */
export const jsonBodyArb = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true }),
    fc.string(),
    fc.array(fc.anything(), { maxLength: 8 }),
    fc.dictionary(fc.string(), fc.anything(), { maxKeys: 8 }),
    fc.record(
      {
        email: fc.string(),
        password: fc.string(),
        code: fc.string(),
        spotId: fc.string(),
        location: fc.string(),
        startTime: fc.string(),
        endTime: fc.string(),
        role: fc.string()
      },
      { requiredKeys: [] }
    )
  );

/** Случайные query-параметры. */
export const queryArb = (): fc.Arbitrary<Record<string, string>> =>
  fc.dictionary(fc.string({ maxLength: 32 }), fc.string({ maxLength: 128 }), {
    maxKeys: 6
  });

/** Случайные path-параметры (в т.ч. невалидные UUID). */
export const pathIdArb = (): fc.Arbitrary<string> =>
  fc.oneof(fc.string(), fc.uuid(), fc.hexaString({ minLength: 8, maxLength: 40 }));

/** Случайный Authorization заголовок. */
export const authHeaderArb = (): fc.Arbitrary<string | undefined> =>
  fc.option(
    fc.oneof(
      fc.string(),
      fc.constant("Bearer"),
      fc.constant("Bearer "),
      fc.tuple(fc.string(), fc.string()).map(([a, b]) => `Bearer ${a}${b}`)
    ),
    { nil: undefined }
  );
