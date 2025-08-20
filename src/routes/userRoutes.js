import express from "express";
import { updateUserRole, getAllUsers } from "../utils/userController.js";
import { isSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// ✅ Fetch all users (Super Admin only)
router.get("/users", isSuperAdmin, getAllUsers);

// ✅ Update a user role (Super Admin only)
router.put("/users/:id/role", isSuperAdmin, updateUserRole);

export default router;
