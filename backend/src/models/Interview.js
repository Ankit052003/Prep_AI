const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    resumeData: Object,
    domain: {
      type: String,
      default: "General",
    },

    questions: [String],

    responses: [
      {
        question: String,
        answer: String,
        evaluation: String,
        score: Number,
        evaluationDetails: mongoose.Schema.Types.Mixed,
      },
    ],

    currentQuestionIndex: {
      type: Number,
      default: 0,
    },

    finalScore: Number,
    finalFeedback: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Interview", interviewSchema);
