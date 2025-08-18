import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const userId = 4; // Change this to the actual ID you want to delete

  // Delete related votes first if needed
  await prisma.vote.deleteMany({ where: { userId } });

  // Then delete the user
  await prisma.user.delete({ where: { id: userId } });

  console.log(`User with ID ${userId} deleted.`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
