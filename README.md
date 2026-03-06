# PrepAI

PrepAI is a full-stack AI mock interview platform. It lets a user upload a resume, generate role-focused interview questions, answer by text or voice, get per-question scoring/feedback, and review a final analytics report.

## Highlights

- Resume upload and parsing (PDF only)
- AI-generated interview questions (configurable count: 1 to 20)
- Domain-based interview tracks:
  - Frontend Developer
  - Backend Developer
  - Data Structures
  - HR Interview
  - System Design
  - Employee Introduction
- Answer evaluation with score + structured feedback
- Voice answer mode with live waveform/intensity
- Confidence metrics (client-side) from transcript/audio stats
- Final report with score trends and weak-topic analysis
- Auth (register/login/me) with JWT
- Resume persistence for logged-in users

## Tech Stack

- Frontend: React 19, React Router 7, Framer Motion, Axios, Vite, Tailwind CSS v4, react-loading-skeleton
- Backend: Node.js, Express 5, Mongoose, Multer, pdf-parse, Axios
- Database: MongoDB
- AI Layer:
  - Chat completion via xAI/Groq-compatible OpenAI-style endpoint
  - STT via Groq-compatible transcription endpoint
  - TTS endpoint currently returns `501` and frontend falls back to browser speech synthesis

## Monorepo Structure

```text
interview-prep-ai/
  backend/
    scripts/
      check-routes.js
    src/
      config/
      controllers/
      middleware/
      models/
      routes/
      services/
  frontend/
    public/
    src/
      assets/
      components/
      context/
      pages/
      services/
```

## Application Flow

1. User uploads resume PDF on `/resume`.
2. Backend extracts text from PDF and calls AI parser.
3. Parsed resume is saved locally in browser; if authenticated, it is also saved in MongoDB (`Resume` model).
4. User starts interview on `/interview`.
5. Backend generates questions from parsed resume + selected domain.
6. User submits text or voice answers.
7. Each answer is evaluated and scored (`0-10`) and stored in `Interview.responses`.
8. User finishes interview and navigates to `/report` for final analytics.

## Frontend Pages

- `/` Home page with animated landing sections
- `/signup` Register/Login page
- `/resume` Resume upload + parsed preview
- `/interview` Interview engine (question flow, text/voice answer, waveform, auto-read)
- `/report` Final report + historical progress analytics

Routes are lazy-loaded with Suspense fallback skeleton UI.

## Voice + Speech Behavior

- Voice input:
  - Uses `MediaRecorder` in browser
  - Sends audio to `/api/test/stt`
  - If route not found (404), retries `/api/interview/voice-answer`
- STT support:
  - Available only when provider resolves to Groq-compatible transcription in current backend setup
- Question reading (TTS):
  - Frontend first tries `/api/test/tts` with a short soft-wait
  - If unavailable/slow, it falls back to browser `speechSynthesis`
  - TTS responses are cached in-memory per question text on the page

## API Reference

Base backend URL (local): `http://localhost:5000`

Notes:
- All routes are mounted under `/api/*`
- Backward-compatible aliases also exist without `/api` (for example `/auth/login`)

### Health

- `GET /` -> returns backend running message

### Auth

- `POST /api/auth/signup` -> create account
- `POST /api/auth/register` -> alias for signup
- `POST /api/auth/login` -> login
- `GET /api/auth/me` -> current user (requires Bearer token)

### Resume

- `POST /api/resume/upload` -> upload PDF (`multipart/form-data`, field `resume`)
  - Optional auth: if token present, parsed resume is saved to DB for user
- `GET /api/resume/me` -> fetch saved parsed resume (auth required)
- `DELETE /api/resume/me` -> delete saved parsed resume (auth required)

### Interview

- `POST /api/interview/start` -> start interview session
- `POST /api/interview/generate` -> alias for start
- `POST /api/interview/answer` -> submit answer
- `POST /api/interview/:interviewId/answer` -> submit answer (param variant)
- `POST /api/interview/evaluate` -> alias for answer
- `POST /api/interview/finish` -> finalize interview and get final score/report
- `POST /api/interview/voice-answer` -> voice transcription alias (multipart audio)

### Test Utilities

- `POST /api/test/stt` -> speech-to-text transcription (`multipart/form-data`, field `audio`)
- `POST /api/test/tts` -> currently returns `501` in this integration

## Key Request Shapes

### Start Interview

`POST /api/interview/start`

```json
{
  "parsedResume": { "skills": ["..."] },
  "domain": "Frontend Developer",
  "questionCount": 3
}
```

Accepted resume payload aliases: `parsedResume`, `parsedData`, `resumeData`, `resumeText`.

### Submit Answer

`POST /api/interview/answer`

```json
{
  "interviewId": "mongo_object_id",
  "answer": "Your answer here"
}
```

### Finish Interview

`POST /api/interview/finish`

```json
{
  "interviewId": "mongo_object_id"
}
```

## Data Models (MongoDB)

- `User`
  - `name`, optional unique `username`, optional unique `email`, `password` (hashed)
- `Resume`
  - one-per-user (`user` unique), `parsedData`
- `Interview`
  - `user` (optional), `resumeData`, `domain`, `questions[]`, `responses[]`, `currentQuestionIndex`, `finalScore`, `finalFeedback`

## Local Storage Keys Used by Frontend

- `prepai-auth-token`
- `prepai-user`
- `prepai-remember-identity`
- `parsedResume`
- `finalResult`
- `interviewHistory`
- `selectedInterviewDomain`
- `selectedInterviewQuestionCount`

## Setup (Local Development)

### Prerequisites

- Node.js 20+ recommended
- npm
- MongoDB instance (local or cloud)

### 1) Clone

```bash
git clone https://github.com/Ankit052003/Prep_AI.git
cd Prep_AI
```

### 2) Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:5000` by default.

### 3) Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Environment Configuration Notes

This README intentionally omits API-key values/details.

- Backend requires database/auth/AI provider configuration in `backend/.env`.
- Frontend supports optional env overrides for API base/proxy target/media URLs.
- Vite proxy target defaults to `http://localhost:5000` in `frontend/vite.config.ts`.
- Frontend API client default base is `http://localhost:5000/api` if no override is provided.

## Scripts

### Backend (`backend/package.json`)

- `npm run dev` -> start with nodemon
- `npm start` -> start with node
- `npm run check:routes` -> route existence/status check script

### Frontend (`frontend/package.json`)

- `npm run dev` -> start Vite dev server
- `npm run build` -> type-check + production build
- `npm run lint` -> ESLint
- `npm run preview` -> preview production build

## Current Constraints / Known Behavior

- Backend TTS endpoint (`/api/test/tts`) currently returns `501`; browser speech synthesis is used as fallback.
- STT is wired for Groq-compatible transcription in this backend flow.
- Resume upload accepts PDF only.
- Interview question generation defaults to `1` question if not specified.

## Troubleshooting

- Backend fails on startup:
  - Verify MongoDB is reachable and backend env config is present.
- `401` on protected routes:
  - Ensure Bearer token is sent from frontend auth session.
- Voice transcription not working:
  - Confirm browser microphone permission is granted.
  - Check `/api/test/stt` availability and provider compatibility.
- Slow/failed question audio reading:
  - App automatically falls back to browser TTS if backend TTS is unavailable.

## License

MIT License. See [LICENSE](./LICENSE).
