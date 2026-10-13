import { Router } from "express";
import { createAccountHandler, loginHandler, logoutHandler } from "@controller/authController";

const router = Router();

router.post("/create-account", createAccountHandler);
router.post("/login", loginHandler);
router.get("/logout", logoutHandler);

export default router;
