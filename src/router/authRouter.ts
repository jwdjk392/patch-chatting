import { Router } from "express";
import { createAccountHandler } from "@controller/authController";

const router = Router();

router.post("/create-account", createAccountHandler);

export default router;