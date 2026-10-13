import { Router } from "express";
import { createAccountHandler, loginHandler, logoutHandler, getTokenHandler } from "@controller/authController";

const router = Router();

router.post("/create-account", createAccountHandler);
router.post("/login", loginHandler);
router.get("/logout", logoutHandler);

router.get("/get-token", getTokenHandler);

export default router;
