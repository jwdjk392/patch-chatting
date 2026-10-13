import { Router } from "express";
import { createAccountHandler } from "@controller/authController";

const router = Router();

router.get("/create-account", createAccountHandler);

export default router;