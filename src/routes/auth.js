import express from "express";
import { PrismaClient } from "@prisma/client";
import { body, validationResult, query } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import emailValidator from "email-validator";
import transporter from "../utils/mailer.js";
import { requireRole } from "../middleware/checkRole.js";

const prisma = new PrismaClient();
const router = express.Router();

const allowedDomain = "@student.uat.edu.ng";

// Utility function to get IP
function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",").shift() ||
    req.socket?.remoteAddress
  );
}

// Register route
router.post(
  "/register",
  [
    body("name").notEmpty(),
    body("email").isEmail(),
    body("matricNumber").notEmpty(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, email, matricNumber, password } = req.body;
    const ip = getClientIp(req);

    if (!emailValidator.validate(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!email.endsWith(allowedDomain)) {
      return res
        .status(400)
        .json({ message: `Only ${allowedDomain} emails are allowed` });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { matricNumber }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.create({
      data: {
        name,
        email,
        matricNumber,
        password: hashedPassword,
        verificationToken,
        lastLoginIp: ip,
      },
    });

    const link = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Email",
      html: `<p>Hello ${name}, click <a href="${link}">here</a> to verify your email address.</p>`,
    });

    res.json({ message: "Registration successful. Please verify your email." });
  }
);

// Email verification
router.get("/verify-email", [query("token").notEmpty()], async (req, res) => {
  const { token } = req.query;

  const user = await prisma.user.findFirst({
    where: { verificationToken: token },
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verified: true,
      verificationToken: null,
    },
  });

  res.json({ message: "Email verified successfully" });
});

// Login route
router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const { email, password } = req.body;
    const ip = getClientIp(req);

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.verified) {
      return res.status(400).json({ message: "Email not verified" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Optional: log IP address
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginIp: ip,
        lastLoginAt: new Date(),
      },
    });

    const token = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.json({
      token,
      name: user.name,
      role: user.role,
      message: "Login successful",
    });
  }
);

export default router;
