const express = require("express");
const { registerUser, loginUser, getCurrentUser } = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/signup", registerUser);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", requireAuth, getCurrentUser);

module.exports = router;
