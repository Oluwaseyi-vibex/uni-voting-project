// server.mjs (Backend - Node.js, Express.js, LowDB using ES Modules)

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto"; // Import crypto for token generation

dotenv.config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// Database Setup
const defaultData = { users: [], candidates: [], votes: [] };
const db = new Low(new JSONFile("db.json"), defaultData);

(async () => {
  await db.read();
  db.data ||= { users: [], candidates: [], votes: [] }; // Ensure default structure
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

// Register User with Email Verification
app.post("/register", async (req, res) => {
  await db.read(); // Ensure latest data
  db.data ||= { users: [], candidates: [], votes: [] };
  db.data.users ||= [];

  const { email, password } = req.body;
  const userExists = db.data.users.find((u) => u.email === email);

  if (userExists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  db.data.users.push({
    email,
    password: hashedPassword,
    verified: false,
    role: "user",
    verificationToken,
  });

  await db.write();

  const verifyLink = `${process.env.BASE_URL}/verify-email?token=${verificationToken}`;

  // Send email
  const mailOptions = {
    from: `"E-Voting System" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify Your Email",
    html: `<p>Click <a href="${verifyLink}">here</a> to verify your email.</p> <br/> <p> Click Login to login to your account after verification</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(201).json({
      message: "Registration successful. Check your email for verification.",
    });
  } catch (error) {
    res.status(500).json({ message: "Error sending verification email" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Check if db.data or db.data.users is undefined
  if (!db.data || !db.data.users) {
    return res.status(500).json({ message: "Database not initialized" });
  }

  console.log("Email:", email, "Password:", password);
  console.log("Users in DB:", db.data.users);
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
  res.json({ token, role: user.role, message: "Login successful" });
});

// Verify Email
app.get("/verify-email", async (req, res) => {
  await db.read();
  const { token } = req.query;
  const user = db.data.users.find((u) => u.verificationToken === token);
  console.log(user);

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  user.verified = true;
  user.verificationToken = null; // Remove token after verification
  await db.write();

  res.json({ message: "Email verified successfully" });
});

app.get("/test-email", async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "kylersilver6@gmail.com",
      subject: "Test Email",
      text: "This is a test email from the e-voting system.",
    });

    res.json({ message: "Email sent successfully!", info });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({ message: "Failed to send email", error });
  }
});

// Candidate Registration (Admin Only)
app.post("/add-candidate", async (req, res) => {
  await db.read(); // Ensure the latest data is loaded

  if (!db.data) {
    db.data = { candidates: [], votes: [] }; // Initialize if undefined
  }

  if (!db.data.candidates) {
    db.data.candidates = []; // Ensure candidates array exists
  }

  const { name, party, position } = req.body;
  if (!name || !party || !position) {
    return res
      .status(400)
      .json({ message: "Name, party, and position are required" });
  }

  const newCandidate = { id: Date.now(), name, party, position, votes: 0 };
  db.data.candidates.push(newCandidate);

  await db.write(); // Save changes to the database
  res.json({
    message: "Candidate added successfully",
    candidate: newCandidate,
  });
});

// Voting Endpoint
app.post("/vote", async (req, res) => {
  await db.read(); // Ensure latest data

  // Ensure the database structure is initialized
  db.data ||= { users: [], candidates: [], votes: [] };
  db.data.votes ||= []; // Ensure votes array exists

  const { email, candidateId } = req.body; // Extract email from req.body

  if (!email || !candidateId) {
    return res
      .status(400)
      .json({ message: "Email and candidateId are required" });
  }

  const user = db.data.users.find((u) => u.email === email);
  if (!user || !user.verified) {
    return res.status(400).json({ message: "User not verified" });
  }

  const candidate = db.data.candidates.find((c) => c.id === candidateId);
  if (!candidate) {
    return res.status(400).json({ message: "Candidate not found" });
  }

  // Check if user has already voted for this position
  const hasVoted = db.data.votes.some(
    (v) => v.email === email && v.position === candidate.position
  );
  if (hasVoted) {
    return res
      .status(400)
      .json({ message: `You have already voted for ${candidate.position}` });
  }

  // Record vote
  candidate.votes += 1;
  db.data.votes.push({ email, candidateId, position: candidate.position });
  await db.write();

  res.json({ message: "Vote cast successfully" });
});

// Get user's voted candidates
app.get("/user-votes", async (req, res) => {
  await db.read(); // Ensure latest data
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // Ensure votes array exists
  if (!db.data.votes) {
    db.data.votes = []; // Initialize if missing
  }

  const userVotes = db.data.votes
    .filter((v) => v.email === email)
    .map((v) => v.candidateId);

  res.json({ votedCandidates: userVotes });
});

// Get Election Results
app.get("/results", (req, res) => {
  res.json(db.data.candidates);
});

(async () => {
  await db.read();
  db.data = db.data || { users: [], candidates: [], votes: [] };
  await db.write();

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
