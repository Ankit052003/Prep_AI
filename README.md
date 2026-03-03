# PrepAI - AI Interview Practice Platform

PrepAI is a full-stack application that helps candidates practice technical interviews using AI.
It supports resume upload/parsing, AI-generated interview questions, answer evaluation, voice-to-text input, and a final interview report.

## Live Concept
- Upload your resume (PDF)
- Generate 5 tailored technical questions from your resume
- Answer by text or voice
- Receive per-answer feedback + score
- Finish interview and get final report

## Project Stack
- Frontend: React 19, React Router, Axios, Vite
- Backend: Node.js, Express, Mongoose, Multer, pdf-parse, Axios
- Database: MongoDB
- AI: Google Gemini API (`generateContent`)

## Monorepo Structure
```text
interview-prep-ai/
  backend/
    src/
      config/
      controllers/
      models/
      routes/
      services/
    scripts/
  frontend/
    src/
      pages/
      components/
      services/
```

## Core Features
1. Resume upload and parsing
2. Interview question generation (5 questions)
3. Answer evaluation with score + feedback
4. Voice mode (record -> speech-to-text -> submit answer)
5. Final report with overall score and detailed responses

## API Overview
Base URL: `http://localhost:5000`

- `GET /` -> backend health check
- `POST /api/resume/upload` -> upload resume file (`form-data`, key: `resume`)
- `POST /api/interview/start` -> start interview from parsed resume
- `POST /api/interview/generate` -> alias of start
- `POST /api/interview/answer` -> submit answer
- `POST /api/interview/:interviewId/answer` -> submit answer (path param variant)
- `POST /api/interview/evaluate` -> alias of answer
- `POST /api/interview/finish` -> final score + report
- `POST /api/test/stt` -> speech-to-text test (`form-data`, key: `audio`)

## Prerequisites
- Node.js 20+ (recommended)
- npm
- MongoDB (local or Atlas)
- Google AI API key (Gemini)

## Clone and Run Locally
1. Clone the repository
```bash
git clone https://github.com/Ankit052003/Prep_AI.git
cd Prep_AI
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Create backend environment file `backend/.env`
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
GOOGLE_AI_API_KEY=your_google_ai_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_BASE=https://generativelanguage.googleapis.com/v1
```

4. Run backend
```bash
npm run dev
```

5. Install frontend dependencies (new terminal)
```bash
cd frontend
npm install
```

6. (Optional) Create frontend environment file `frontend/.env`
```env
# Default is http://localhost:5000/api if omitted
# Use /api only when running through Vite dev proxy
VITE_API_BASE_URL=http://localhost:5000/api
VITE_BACKEND_URL=http://localhost:5000
```

7. Run frontend
```bash
npm run dev
```

8. Open app in browser
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## Typical User Flow
1. Open homepage
2. Go to Resume page and upload PDF
3. Continue to Interview page
4. Start interview
5. Submit answers (text/voice)
6. Finish interview
7. Review report

## Useful Commands
Backend:
```bash
npm run dev
npm start
npm run check:routes
```

Frontend:
```bash
npm run dev
npm run build
npm run preview
```

## Notes for Contributors
- Frontend API base URL is set in `frontend/src/services/api.js`:
  - Uses `VITE_API_BASE_URL` (default: `http://localhost:5000/api`)
  - You can set `VITE_API_BASE_URL=/api` and use Vite dev proxy (`VITE_BACKEND_URL`)
- Voice input uses browser `MediaRecorder` + backend `/api/test/stt`.
- If Gemini or MongoDB env values are missing, backend routes will fail.

## Troubleshooting
- `GOOGLE_AI_API_KEY is not set`
  - Ensure `backend/.env` exists and backend was restarted.
- MongoDB connection error
  - Verify `MONGO_URI` is valid and database is reachable.
- CORS/API issues
  - Ensure backend is running on `5000` and frontend on `5173`.

## License
This project is for educational/interview-practice use. Add your preferred open-source license if needed.
