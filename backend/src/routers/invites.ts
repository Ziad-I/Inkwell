import { Router } from "express";
import { getBoardInvite, redeemBoardInvite } from "@/controllers/invites.js";

const router = Router();

router.post("/redeem", redeemBoardInvite);
router.get("/:token", getBoardInvite);

export default router;