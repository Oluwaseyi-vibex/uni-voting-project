import express from "express";
import { updateUserRole, getAllUsers } from "../utils/userController.js";
import { isSuperAdmin } from "../middleware/superAdminAuth.js";
import { authenticate } from "../middleware/superauth.js";
const router = express.Router();

// ✅ Fetch all users (Super Admin only)
router.get("/users", authenticate, isSuperAdmin, getAllUsers);

// ✅ Update a user role (Super Admin only)
router.put("/users/:id/role", isSuperAdmin, updateUserRole);

export default router;
