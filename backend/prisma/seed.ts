import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createUser(email: string, password: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role, emailVerifiedAt: now },
    create: { email, passwordHash, role, emailVerifiedAt: now }
  });
}

const PARKING_LOTS = [
  {
    location: "г. Москва, ТЦ «Европейский», пл. Киевского Вокзала, 2",
    prefix: "EUR",
    pricePerHour: "120.00"
  },
  {
    location: "г. Москва, ТРЦ «Атриум», ул. Земляной Вал, 33",
    prefix: "ATR",
    pricePerHour: "110.00"
  },
  {
    location: "г. Москва, Белорусский вокзал, пл. Тверская Застава, 7",
    prefix: "BEL",
    pricePerHour: "95.00"
  }
] as const;

async function main() {
  await createUser("admin@example.com", "Admin123!", Role.ADMIN);
  await createUser("operator@example.com", "Operator123!", Role.OPERATOR);
  await createUser("driver@example.com", "Driver123!", Role.DRIVER);

  await prisma.booking.deleteMany();
  await prisma.parkingSpot.deleteMany();

  for (const lot of PARKING_LOTS) {
    for (let i = 1; i <= 30; i++) {
      const code = `${lot.prefix}-${String(i).padStart(2, "0")}`;
      await prisma.parkingSpot.create({
        data: {
          code,
          location: lot.location,
          pricePerHour: lot.pricePerHour,
          isActive: true
        }
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
