import { Router } from "express";
import { me, updateProfile } from "@/controllers/users.js";
import { requireAuth } from "@/middlewares/auth.js";

const router = Router();

router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateProfile);

export default router;