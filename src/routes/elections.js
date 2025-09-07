// import express from "express";
// import { PrismaClient } from "@prisma/client";
// import { body, param, query, validationResult } from "express-validator";
// import authenticateAdmin from "../middleware/auth.js";

// const prisma = new PrismaClient();
// const router = express.Router();

// // Create Election
// router.post(
//   "/create",
//   authenticateAdmin,
//   [body("name").notEmpty()],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty())
//       return res.status(400).json({ errors: errors.array() });

//     const { name, description } = req.body;

//     const election = await prisma.election.create({
//       data: { name, description },
//     });

//     res.json({ message: "Election created", election });
//   }
// );

// // Add Candidate
// router.post(
//   "/add-candidate",
//   authenticateAdmin,
//   [
//     body("electionId").toInt(),
//     body("name").notEmpty(),
//     body("party").notEmpty(),
//     body("position").notEmpty(),
//   ],
//   async (req, res) => {
//     const { electionId, name, party, position } = req.body;

//     const candidate = await prisma.candidate.create({
//       data: {
//         name,
//         party,
//         position,
//         electionId,
//       },
//     });

//     res.json({ message: "Candidate added", candidate });
//   }
// );

// // Delete Candidate
// router.delete(
//   "/:electionId/candidate/:candidateId",
//   authenticateAdmin,
//   async (req, res) => {
//     const { electionId, candidateId } = req.params;

//     await prisma.vote.deleteMany({
//       where: { candidateId: Number(candidateId) },
//     });

//     await prisma.candidate.delete({
//       where: { id: Number(candidateId) },
//     });

//     res.json({ message: "Candidate deleted with votes" });
//   }
// );

// // Get All Elections
// router.get("/", async (req, res) => {
//   const elections = await prisma.election.findMany({
//     include: { candidates: true },
//   });
//   res.json(elections);
// });

// // Get Election by ID
// router.get("/:id", [param("id").isInt()], async (req, res) => {
//   const election = await prisma.election.findUnique({
//     where: { id: Number(req.params.id) },
//     include: { candidates: true },
//   });

//   if (!election) return res.status(404).json({ message: "Election not found" });

//   res.json(election);
// });

// export default router;

import express from "express";
import { PrismaClient } from "@prisma/client";
import { body, param, validationResult } from "express-validator";
import authenticateAdmin from "../middleware/auth.js";
import { logAudit } from "../utils/auditLogger.js";

const prisma = new PrismaClient();
const router = express.Router();

// Create Election
router.post(
  "/create",
  authenticateAdmin,
  [body("name").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, description } = req.body;

    const election = await prisma.election.create({
      data: { name, description },
    });

    // 🔹 Audit log
    await logAudit({
      userId: req.user.id,
      action: "CREATE_ELECTION",
      entityType: "Election",
      entityId: election.id.toString(),
      newValues: election,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ message: "Election created", election });
  }
);

// Add Candidate
router.post(
  "/add-candidate",
  authenticateAdmin,
  [
    body("electionId").toInt(),
    body("name").notEmpty(),
    body("party").notEmpty(),
    body("position").notEmpty(),
  ],
  async (req, res) => {
    const { electionId, name, party, position } = req.body;

    const candidate = await prisma.candidate.create({
      data: {
        name,
        party,
        position,
        electionId,
      },
    });

    // 🔹 Audit log
    await logAudit({
      userId: req.user.id,
      action: "ADD_CANDIDATE",
      entityType: "Candidate",
      entityId: candidate.id.toString(),
      newValues: candidate,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ message: "Candidate added", candidate });
  }
);

// Delete Candidate
router.delete(
  "/:electionId/candidate/:candidateId",
  authenticateAdmin,
  async (req, res) => {
    const { candidateId } = req.params;

    // Get old candidate before deleting
    const oldCandidate = await prisma.candidate.findUnique({
      where: { id: Number(candidateId) },
    });

    if (!oldCandidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    await prisma.vote.deleteMany({
      where: { candidateId: Number(candidateId) },
    });

    await prisma.candidate.delete({
      where: { id: Number(candidateId) },
    });

    // 🔹 Audit log
    await logAudit({
      userId: req.user.id,
      action: "DELETE_CANDIDATE",
      entityType: "Candidate",
      entityId: candidateId,
      oldValues: oldCandidate,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ message: "Candidate deleted with votes" });
  }
);

// Get All Elections
router.get("/", async (req, res) => {
  const elections = await prisma.election.findMany({
    include: { candidates: true },
  });
  res.json(elections);
});

// Get Election by ID
router.get("/:id", [param("id").isInt()], async (req, res) => {
  const election = await prisma.election.findUnique({
    where: { id: Number(req.params.id) },
    include: { candidates: true },
  });

  if (!election) return res.status(404).json({ message: "Election not found" });

  res.json(election);
});

export default router;
