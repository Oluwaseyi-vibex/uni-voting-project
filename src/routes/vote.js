import express from "express";
import { PrismaClient } from "@prisma/client";
import { body, query, validationResult } from "express-validator";
import verifyCaptcha from "../middleware/captcha.js";
import { logAudit } from "../utils/auditLogger.js";

const prisma = new PrismaClient();
const router = express.Router();

// Cast Vote
// router.post(
//   "/",
//   verifyCaptcha,
//   [
//     body("email").isEmail(),
//     body("candidateId").isInt(),
//     body("electionId").isInt(),
//   ],
//   async (req, res) => {
//     const { email, candidateId, electionId } = req.body;
//     if (!candidateId || !email || !electionId) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user || !user.verified)
//       return res.status(400).json({ message: "Invalid or unverified user" });

//     const candidate = await prisma.candidate.findUnique({
//       where: { id: candidateId },
//     });
//     if (!candidate)
//       return res.status(404).json({ message: "Candidate not found" });

//     const alreadyVoted = await prisma.vote.findFirst({
//       where: {
//         userId: user.id,
//         electionId: electionId,
//         position: candidate.position,
//       },
//     });

//     if (alreadyVoted) {
//       return res
//         .status(400)
//         .json({ message: `Already voted for ${candidate.position}` });
//     }

//     await prisma.vote.create({
//       data: {
//         userId: user.id,
//         candidateId,
//         electionId,
//         position: candidate.position,
//       },
//     });

//     await prisma.candidate.update({
//       where: { id: candidateId },
//       data: { votesCount: { increment: 1 } },
//     });

//     res.json({ message: "Vote cast successfully" });
//   }
// );
// Cast Vote
router.post(
  "/",
  verifyCaptcha,
  [
    body("email").isEmail(),
    body("candidateId").isInt(),
    body("electionId").isInt(),
  ],
  async (req, res) => {
    const { email, candidateId, electionId } = req.body;
    if (!candidateId || !email || !electionId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.verified)
      return res.status(400).json({ message: "Invalid or unverified user" });

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate)
      return res.status(404).json({ message: "Candidate not found" });

    const alreadyVoted = await prisma.vote.findFirst({
      where: {
        userId: user.id,
        electionId: electionId,
        position: candidate.position,
      },
    });

    if (alreadyVoted) {
      return res
        .status(400)
        .json({ message: `Already voted for ${candidate.position}` });
    }

    const vote = await prisma.vote.create({
      data: {
        userId: user.id,
        candidateId,
        electionId,
        position: candidate.position,
      },
    });

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { votesCount: { increment: 1 } },
    });

    // 🔹 Audit log (keeps vote private, does not log candidateId)
    await logAudit({
      userId: user.id,
      action: "CAST_VOTE",
      entityType: "Vote",
      entityId: vote.id.toString(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ message: "Vote cast successfully" });
  }
);

// Get User Votes
// router.get("/user", [query("email").isEmail()], async (req, res) => {
//   const { email } = req.query;
//   const user = await prisma.user.findUnique({ where: { email } });

//   if (!user) return res.status(404).json({ message: "User not found" });

//   const votes = await prisma.vote.findMany({
//     where: { userId: user.id },
//     select: { candidateId: true },
//   });

//   res.json({ votedCandidates: votes.map((v) => v.candidateId) });
// });
// Get User Votes
router.get("/user", [query("email").isEmail()], async (req, res) => {
  const { email } = req.query;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(404).json({ message: "User not found" });

  const votes = await prisma.vote.findMany({
    where: { userId: user.id },
    select: { candidateId: true },
  });

  // 🔹 Audit log
  await logAudit({
    userId: user.id,
    action: "VIEW_USER_VOTES",
    entityType: "Vote",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.json({ votedCandidates: votes.map((v) => v.candidateId) });
});

// Get Election Results
// router.get("/results", [query("electionId").isInt()], async (req, res) => {
//   const { electionId } = req.query;

//   const election = await prisma.election.findUnique({
//     where: { id: Number(electionId) },
//     include: { candidates: true },
//   });

//   if (!election) return res.status(404).json({ message: "Election not found" });

//   res.json({ election: election.name, candidates: election.candidates });
// });
// Get Election Results
router.get("/results", [query("electionId").isInt()], async (req, res) => {
  const { electionId } = req.query;

  const election = await prisma.election.findUnique({
    where: { id: Number(electionId) },
    include: { candidates: true },
  });

  if (!election) return res.status(404).json({ message: "Election not found" });

  // 🔹 Audit log
  await logAudit({
    action: "VIEW_RESULTS",
    entityType: "Election",
    entityId: electionId.toString(),
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.json({ election: election.name, candidates: election.candidates });
});

export default router;
