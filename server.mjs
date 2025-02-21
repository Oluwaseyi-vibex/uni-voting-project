// server.mjs (Backend - Node.js, Express.js, LowDB using ES Modules)

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
import * as faceapi from "face-api.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

app.post("/register-face", async (req, res) => {
  await db.read();
  db.data.users = db.data.users || []; // Ensure users array exists

  const { name, email, matricNumber, password, faceDescriptor } = req.body;
  // console.log(name, email, matricNumber, password);

  // Check for missing fields
  if (!name || !email || !matricNumber || !password || !faceDescriptor) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });
  }

  // Validate email format
  if (!emailValidator.validate(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email format." });
  }

  // Check if email or matric number already exists
  const existingUser = db.data.users.find(
    (user) => user.email === email || user.matricNumber === matricNumber
  );

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "User already exists with this email or matric number.",
    });
  }

  // Check for duplicate face
  let isFaceDuplicate = false;
  for (const user of db.data.users) {
    if (user.faceDescriptor) {
      const distance = faceapi.euclideanDistance(
        user.faceDescriptor,
        faceDescriptor
      );
      if (distance < 0.6) {
        // Threshold for recognizing as the same face
        isFaceDuplicate = true;
        break;
      }
    }
  }

  if (isFaceDuplicate) {
    return res.status(400).json({
      success: false,
      message: "Face already registered. You cannot create multiple accounts.",
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate a verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");

  // Save user details
  const newUser = {
    name,
    email,
    matricNumber,
    password: hashedPassword, // Store hashed password
    faceDescriptor,
    verified: false, // Set to false until email is verified
    verificationToken,
    role: "user",
  };

  db.data.users.push(newUser);
  await db.write();
  // Send verification email
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
});

// Face Authentication Endpoint
// Face Authentication Endpoint
app.post("/face-auth", async (req, res) => {
  await db.read();
  db.data.users = db.data.users || []; // Ensure users array exists

  if (!db.data || !Array.isArray(db.data.users)) {
    return res
      .status(500)
      .json({ success: false, message: "User database not initialized" });
  }

  const { descriptor } = req.body;
  // console.log("descriptor:", descriptor);
  if (!descriptor) {
    return res
      .status(400)
      .json({ success: false, message: "No face detected" });
  }

  let bestMatch = null;
  let minDistance = 1.0; // Start with a high distance (worst match)

  for (const user of db.data.users) {
    if (user.faceDescriptor) {
      console.log("Comparing with user:", user.email);
      try {
        const distance = faceapi.euclideanDistance(
          user.faceDescriptor,
          descriptor
        );
        if (distance < 0.6 && distance < minDistance) {
          bestMatch = user;
          minDistance = distance;
        }
      } catch (error) {
        console.error("Error comparing face descriptors:", error);
        return res.status(500).json({
          success: false,
          message: "Error processing face authentication",
        });
      }
    }
  }

  if (bestMatch) {
    res.json({
      success: true,
      user: {
        name: bestMatch.name,
        email: bestMatch.email,
        matricNumber: bestMatch.matricNumber,
      },
    });
  } else {
    res.json({ success: false, message: "Face not recognized" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Login Triggered");
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
  res.json({
    token,
    name: user.name,
    role: user.role,
    message: "Login successful",
  });
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

// Delete Candidate (Admin Only)
app.delete("/delete-candidate/:id", async (req, res) => {
  console.log("Deleting candidate...");
  await db.read(); // Ensure the latest data is loaded

  const candidateId = parseInt(req.params.id);
  if (!candidateId) {
    return res.status(400).json({ message: "Invalid candidate ID" });
  }

  const candidateIndex = db.data.candidates.findIndex(
    (c) => c.id === candidateId
  );
  if (candidateIndex === -1) {
    return res.status(404).json({ message: "Candidate not found" });
  }

  // Remove candidate
  db.data.candidates.splice(candidateIndex, 1);

  // Remove all votes related to this candidate
  db.data.votes = db.data.votes.filter(
    (vote) => vote.candidateId !== candidateId
  );

  await db.write(); // Save the changes to the database

  res.json({ message: "Candidate and their votes deleted successfully" });
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
