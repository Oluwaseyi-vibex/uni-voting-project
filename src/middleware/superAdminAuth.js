// middleware/superAdminAuth.js
export const isSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized. User not found." });
  }

  if (req.user.role !== "SUPER_ADMIN") {
    return res
      .status(403)
      .json({ message: "Access denied. Super admin only." });
  }

  next();
};
