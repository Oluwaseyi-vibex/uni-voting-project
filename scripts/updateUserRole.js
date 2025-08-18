// prisma/updateUserRole.js (or inside your route handler)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateUserRole(userId, newRole) {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    console.log("User role updated:", updatedUser);
  } catch (error) {
    console.error("Error updating user role:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Example: Change role of user with ID 1 to "admin"
updateUserRole("c71d312b-d920-4b32-8eb6-f49a718f2717", "admin");
