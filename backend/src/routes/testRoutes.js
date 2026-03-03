const express = require("express");
const multer = require("multer");
const { testSTT } = require("../controllers/testController");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/stt", upload.single("audio"), testSTT);

module.exports = router;