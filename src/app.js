// src/app.js or src/server.js
import { PrismaClient } from "@prisma/client";

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.js";
import electionRoutes from "./routes/elections.js";
import voteRoutes from "./routes/vote.js";

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

app.use(cors());
app.use(bodyParser.json());

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

export default app;
