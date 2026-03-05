const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "text/plain" }));

// ROUTES
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/interview", require("./routes/interviewRoutes"));
app.use("/api/resume", require("./routes/resumeRoutes"));
app.use("/api/test", require("./routes/testRoutes"));

// Backward-compatible aliases (without /api prefix).
app.use("/auth", require("./routes/authRoutes"));
app.use("/interview", require("./routes/interviewRoutes"));
app.use("/resume", require("./routes/resumeRoutes"));
app.use("/test", require("./routes/testRoutes"));

app.get("/", (req, res) => {
  res.send("AI Interview Backend Running...");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
