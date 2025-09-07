import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function logAudit({
  userId,
  action,
  entityType,
  entityId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        oldValues,
        newValues,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}
