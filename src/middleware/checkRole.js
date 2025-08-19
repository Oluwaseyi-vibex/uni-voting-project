import jwt from "jsonwebtoken";

export function requireRole(roles) {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ message: "No token provided" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Invalid token" });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      if (!roles.includes(decoded.role)) {
        return res
          .status(403)
          .json({ message: "Forbidden: insufficient role" });
      }

      next();
    } catch (err) {
      return res.status(403).json({ message: "Invalid/expired token" });
    }
  };
}
