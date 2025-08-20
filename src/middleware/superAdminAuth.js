export const isSuperAdmin = (req, res, next) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return res
      .status(403)
      .json({ message: "Access denied. Super Admins only." });
  }
  next();
};
