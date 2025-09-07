import express from "express";
import { PrismaClient } from "@prisma/client";
import authenticateAdmin from "../middleware/auth.js";

const prisma = new PrismaClient();
const router = express.Router();

// Get Audit Logs with filters
router.get("/audit-logs", authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      user,
      action,
      startDate,
      endDate,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // build where conditions
    const where = {};

    if (user) {
      where.user = {
        email: { contains: user, mode: "insensitive" },
      };
    }

    if (action) {
      where.action = { contains: action, mode: "insensitive" };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // include end of the day
        where.createdAt.lte = new Date(
          new Date(endDate).setHours(23, 59, 59, 999)
        );
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total });
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
