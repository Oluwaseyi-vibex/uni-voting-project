import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const setSuperAdmin = async () => {
  try {
    const userEmail = "oluwaseyifunmi.kodeleyiri@student.uat.edu.ng"; // Replace with your actual email

    const user = await prisma.user.update({
      where: {
        email: userEmail,
      },
      data: {
        role: "SUPER_ADMIN",
      },
    });

    console.log("✅ User updated successfully:");
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`ID: ${user.id}`);
  } catch (error) {
    if (error.code === "P2025") {
      console.log("❌ User not found with that email");
    } else {
      console.error("❌ Error updating user:", error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
};

setSuperAdmin();
