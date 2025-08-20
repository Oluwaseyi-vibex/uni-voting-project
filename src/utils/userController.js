import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    console.log("🔍 Fetching all users...");

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        matricNumber: true,
        verified: true,
      },
    });

    console.log(`✅ Found ${users.length} users`);
    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({
      error: "Failed to fetch users",
      message: error.message,
    });
  }
};

// Update user role
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Debug logging
    console.log("🔍 Update user role request:");
    console.log("User ID:", id);
    console.log("New Role:", role);
    console.log("ID Type:", typeof id);
    console.log("Parsed ID:", parseInt(id));

    // Validate inputs
    if (!id) {
      console.log("❌ Missing user ID");
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!role) {
      console.log("❌ Missing role");
      return res.status(400).json({ error: "Role is required" });
    }

    // Validate role values
    const validRoles = ["STUDENT", "ADMIN", "SUPER_ADMIN"];
    if (!validRoles.includes(role)) {
      console.log("❌ Invalid role:", role);
      return res.status(400).json({
        error: "Invalid role",
        validRoles,
      });
    }

    // Check if user exists first
    const existingUser = await prisma.user.findUnique({
      where: { id: id },
    });

    if (!existingUser) {
      console.log("❌ User not found with ID:", id);
      return res.status(404).json({ error: "User not found" });
    }

    console.log("✅ Found user:", existingUser.email);
    console.log("Current role:", existingUser.role);

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    console.log("✅ User role updated successfully:");
    console.log("Email:", updatedUser.email);
    console.log("Old role:", existingUser.role);
    console.log("New role:", updatedUser.role);

    res.json({
      message: "Role updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error updating user role:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);

    // Handle specific Prisma errors
    if (error.code === "P2025") {
      return res.status(404).json({
        error: "User not found",
        message: "No user found with the provided ID",
      });
    }

    if (error.code === "P2002") {
      return res.status(400).json({
        error: "Constraint violation",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to update user role",
      message: error.message,
      code: error.code,
    });
  }
};
