import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("superadmin123", 10);

  await prisma.user.upsert({
    where: { email: "superadmin@evote.com" },
    update: {},
    create: {
      email: "superadmin@evote.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  });

  console.log("✅ Super Admin seeded!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
