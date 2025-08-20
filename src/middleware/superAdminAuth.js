export const isSuperAdmin = (req, res, next) => {
  if (req.user.role !== "STUDENT") {
    return res
      .status(403)
      .json({ message: "Access denied. Super Admins only." });
  }
  next();
};
