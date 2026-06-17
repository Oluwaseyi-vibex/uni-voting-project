// src/app.js or src/server.js
import { PrismaClient } from "@prisma/client";

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.js";
import electionRoutes from "./routes/elections.js";
import voteRoutes from "./routes/vote.js";
import userRoutes from "./routes/userRoutes.js";
import auditRoutes from "./routes/auditLogs.js";

const app = express();
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(users);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Configure CORS to allow only the frontend origin and support credentials
const allowedOrigins = [process.env.FRONTEND_URL || "https://uatvote.vercel.app"];
const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    // Deny CORS requests gracefully without throwing an error (throwing causes a 500 and no CORS headers)
    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(bodyParser.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests",
});
app.use(globalLimiter);

app.use("/auth", authRoutes);
app.use("/elections", electionRoutes);
app.use("/vote", voteRoutes);
app.use("/update", userRoutes);
app.use("/admin", auditRoutes);

export default app;
