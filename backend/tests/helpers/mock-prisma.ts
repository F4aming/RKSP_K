import { vi } from "vitest";
import { BookingStatus, Role } from "@prisma/client";

const mockUserId = "11111111-1111-1111-1111-111111111111";
const mockSpotId = "22222222-2222-2222-2222-222222222222";
const mockBookingId = "33333333-3333-3333-3333-333333333333";

const mockUser = {
  id: mockUserId,
  email: "driver@example.com",
  passwordHash: "$2a$10$mockhashmockhashmockhashmockuu",
  role: Role.DRIVER,
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

const mockSpot = {
  id: mockSpotId,
  code: "EUR-01",
  location: "г. Москва, тест",
  pricePerHour: "100.00",
  isActive: true
};

const mockBooking = {
  id: mockBookingId,
  userId: mockUserId,
  spotId: mockSpotId,
  startTime: new Date("2026-06-01T10:00:00.000Z"),
  endTime: new Date("2026-06-01T12:00:00.000Z"),
  status: BookingStatus.ACTIVE,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  spot: mockSpot,
  user: mockUser
};

export function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(mockUser),
      findMany: vi.fn().mockResolvedValue([mockUser]),
      create: vi.fn().mockResolvedValue({ ...mockUser, emailVerifiedAt: null }),
      update: vi.fn().mockResolvedValue(mockUser),
      delete: vi.fn().mockResolvedValue(mockUser)
    },
    parkingSpot: {
      findMany: vi.fn().mockResolvedValue([mockSpot]),
      create: vi.fn().mockResolvedValue(mockSpot),
      update: vi.fn().mockResolvedValue(mockSpot),
      delete: vi.fn().mockResolvedValue(mockSpot)
    },
    booking: {
      findMany: vi.fn().mockResolvedValue([mockBooking]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(mockBooking),
      create: vi.fn().mockResolvedValue(mockBooking),
      update: vi.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED })
    },
    emailVerification: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: "44444444-4444-4444-4444-444444444444",
        userId: mockUserId,
        codeHash: "hash",
        expiresAt: new Date(Date.now() + 900_000),
        createdAt: new Date()
      }),
      delete: vi.fn().mockResolvedValue({})
    },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
  };
}

export { mockUserId, mockSpotId, mockBookingId, mockUser };
