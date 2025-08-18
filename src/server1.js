import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import emailValidator from "email-validator";
import dotenv from "dotenv";
import crypto from "crypto";
import rateLimit from "express-rate-limit"; // For rate limiting
import { body, query, validationResult, param } from "express-validator";
import axios from "axios"; // For CAPTCHA verification

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Database Setup
const defaultData = { users: [], elections: [], votes: [] };
const db = new Low(new JSONFile("db.json"), defaultData);

(async () => {
  await db.read();
  db.data ||= defaultData;
  await db.write();
})();

// Email Transporter (Gmail SMTP Setup)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 1. Rate Limiting (Global and Endpoint-Specific)
// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});
app.use(globalLimiter);

// Stricter rate limit for sensitive endpoints
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour per IP
  message: "Too many attempts, please try again later.",
});

// 2. Request Timeout Middleware
app.use((req, res, next) => {
  req.setTimeout(5000); // 5 seconds timeout
  res.setTimeout(5000);
  next();
});

// Middleware to verify JWT and check admin role
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, "secret");
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// 3. CAPTCHA Verification Middleware
const verifyCaptcha = async (req, res, next) => {
  const { captchaValue } = req.body;
  console.log(captchaValue);
  if (!captchaValue) {
    return res.status(400).json({ message: "CAPTCHA is required" });
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY; // Add to .env
  const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaValue}`;

  try {
    const captchaResponse = await axios.post(verificationURL);
    if (!captchaResponse.data.success) {
      return res.status(400).json({ message: "CAPTCHA verification failed" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Error verifying CAPTCHA" });
  }
};

// Register
app.post(
  "/register",
  sensitiveLimiter, // Apply rate limiting
  [
    // 2. Input Validation
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("matricNumber")
      .trim()
      .notEmpty()
      .withMessage("Matric number is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    await db.read();
    db.data.users = db.data.users || [];

    const { name, email, matricNumber, password } = req.body;

    if (!emailValidator.validate(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    const existingUser = db.data.users.find(
      (user) => user.email === email || user.matricNumber === matricNumber
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email or matric number.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const newUser = {
      name,
      email,
      matricNumber,
      password: hashedPassword,
      verified: false,
      verificationToken,
      role: "user",
    };

    db.data.users.push(newUser);
    await db.write();

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Verify Your Email",
        html: `<p>Hello ${name},</p>
               <p>Click the link below to verify your email:</p>
               <a href="${verificationLink}">Verify Email</a>
               <p>If you didn't request this, you can ignore this email.</p>`,
      });

      res.json({
        success: true,
        message:
          "Registration successful. Please check your email to verify your account.",
      });
    } catch (error) {
      console.error("Error sending email:", error);
      res
        .status(500)
        .json({ success: false, message: "Error sending verification email." });
    }
  }
);

// Login
app.post(
  "/login",
  sensitiveLimiter, // Apply rate limiting
  [
    // 2. Input Validation
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    if (!db.data || !db.data.users) {
      return res.status(500).json({ message: "Database not initialized" });
    }

    const user = db.data.users.find((u) => u.email === email);
    if (!user) return res.status(400).json({ message: "User not found" });

    if (!user.verified) {
      return res.status(400).json({ message: "Email not verified" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ email, role: user.role }, "secret", {
      expiresIn: "1h",
    });
    res.json({
      token,
      name: user.name,
      role: user.role,
      message: "Login successful",
    });
  }
);

// Email Verification
app.get(
  "/verify-email",
  [
    // 2. Input Validation
    query("token").notEmpty().withMessage("Verification token is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    const { token } = req.query;
    const user = db.data.users.find((u) => u.verificationToken === token);

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.verified = true;
    user.verificationToken = null;
    await db.write();

    res.json({ message: "Email verified successfully" });
  }
);

// Create Election (Admin Only)
app.post(
  "/create-election",
  authenticateAdmin,
  sensitiveLimiter, // Apply rate limiting
  [
    // 2. Input Validation
    body("name").trim().notEmpty().withMessage("Election name is required"),
    body("description").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    db.data.elections ||= [];

    const { name, description } = req.body;

    const newElection = {
      id: Date.now(),
      name,
      description: description || "",
      candidates: [],
      createdAt: new Date().toISOString(),
    };
    db.data.elections.push(newElection);
    await db.write();

    res.json({
      message: "Election created successfully",
      election: newElection,
    });
  }
);

// Add Candidate (Admin Only)
app.post(
  "/add-candidate",
  authenticateAdmin,
  sensitiveLimiter, // Apply rate limiting
  [
    // 2. Input Validation
    body("electionId").isInt().withMessage("Election ID must be an integer"),
    body("name").trim().notEmpty().withMessage("Candidate name is required"),
    body("party").trim().notEmpty().withMessage("Party is required"),
    body("position").trim().notEmpty().withMessage("Position is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    db.data.elections ||= [];

    const { electionId, name, party, position } = req.body;

    const election = db.data.elections.find(
      (e) => e.id === parseInt(electionId)
    );
    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    const newCandidate = {
      id: Date.now(),
      name,
      party,
      position,
      votes: 0,
    };
    election.candidates.push(newCandidate);
    await db.write();

    res.json({
      message: "Candidate added successfully",
      candidate: newCandidate,
    });
  }
);

// Get All Elections
app.get("/elections", async (req, res) => {
  await db.read();
  db.data.elections ||= [];
  res.json(db.data.elections);
});

// Delete Candidate (Admin Only)
app.delete(
  "/delete-candidate/:electionId/:candidateId",
  authenticateAdmin,
  sensitiveLimiter, // Apply rate limiting
  async (req, res) => {
    await db.read();
    const { electionId, candidateId } = req.params;

    const election = db.data.elections.find(
      (e) => e.id === parseInt(electionId)
    );
    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    const candidateIndex = election.candidates.findIndex(
      (c) => c.id === parseInt(candidateId)
    );
    if (candidateIndex === -1) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    election.candidates.splice(candidateIndex, 1);
    db.data.votes = db.data.votes.filter(
      (vote) => vote.candidateId !== parseInt(candidateId)
    );
    await db.write();

    res.json({ message: "Candidate and their votes deleted successfully" });
  }
);

// Vote
app.post(
  "/vote",
  sensitiveLimiter, // Apply rate limiting
  verifyCaptcha, // 3. CAPTCHA Verification
  [
    // 2. Input Validation
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("candidateId").isInt().withMessage("Candidate ID must be an integer"),
    body("electionId").isInt().withMessage("Election ID must be an integer"),
    body("captchaValue").notEmpty().withMessage("CAPTCHA value is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    db.data.votes ||= [];

    const { email, candidateId, electionId } = req.body;

    const user = db.data.users.find((u) => u.email === email);
    if (!user || !user.verified) {
      return res.status(400).json({ message: "User not verified" });
    }

    const election = db.data.elections.find(
      (e) => e.id === parseInt(electionId)
    );
    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    const candidate = election.candidates.find(
      (c) => c.id === parseInt(candidateId)
    );
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    const hasVoted = db.data.votes.find(
      (v) =>
        v.email === email &&
        v.electionId === parseInt(electionId) &&
        v.position === candidate.position
    );
    if (hasVoted) {
      return res.status(400).json({
        message: `Already voted for ${candidate.position} in this election`,
      });
    }

    candidate.votes += 1;
    db.data.votes.push({
      email,
      candidateId,
      electionId: parseInt(electionId),
      position: candidate.position,
    });
    await db.write();

    res.json({ message: "Vote cast successfully" });
  }
);

// Get Election by ID
app.get(
  "/elections/:id",
  [param("id").isInt().withMessage("Election ID must be an integer")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    db.data.elections ||= [];

    const election = db.data.elections.find(
      (e) => e.id.toString() === req.params.id
    );

    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    res.json(election);
  }
);
// Get User Votes
app.get(
  "/user-votes",
  [
    // 2. Input Validation
    query("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    const { email } = req.query;

    db.data.votes ||= [];

    const userVotes = db.data.votes
      .filter((v) => v.email === email)
      .map((v) => v.candidateId);

    res.json({ votedCandidates: userVotes });
  }
);

// Get Results
app.get(
  "/results",
  [
    // 2. Input Validation
    query("electionId").isInt().withMessage("Election ID must be an integer"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await db.read();
    const { electionId } = req.query;

    const election = db.data.elections.find(
      (e) => e.id.toString() === electionId
    );
    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    res.json({ election: election.name, candidates: election.candidates });
  }
);

// Start server
(async () => {
  await db.read();
  db.data = db.data || defaultData;
  await db.write();

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
