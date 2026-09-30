
# StudyMate AI 📚✨

**Your personal AI-powered study companion** — turn your study materials into exam-ready notes, quizzes, and flashcards.

🌐 **Live App:** https://studymate-ai-4uu1.onrender.com/  
⚙️ **Backend API:** https://studymate-ai-backend-uwsu.onrender.com  
📖 **API Docs:** https://studymate-ai-backend-uwsu.onrender.com/docs  
💻 **GitHub:** https://github.com/viralpatel16/StudyMate-AI

---

## About

StudyMate AI is a web application designed to make studying and revision more organized. Upload a PDF or TXT document, then use AI-powered tools to create concise study notes, practice questions, and active-recall flashcards from the material.

## Features

- **User accounts:** Register and log in to access your study space.
- **Study material uploads:** Upload PDF and TXT files (up to 15 MB).
- **AI summaries:** Generate concise, exam-ready notes based on your material.
- **Smart quizzes:** Create multiple-choice questions with answers and explanations.
- **Flashcards:** Generate question-and-answer cards for active recall.
- **Saved study content:** Store generated summaries, quizzes, flashcards, and materials for your account.
- **Personal study space:** Manage uploaded materials through the web interface.

> Note: Scanned PDFs that contain images rather than selectable text are not OCR-processed.

## Tech Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS
- React Markdown
- Remark GFM

**Backend**
- Python
- FastAPI
- SQLite
- JWT authentication
- Password hashing with `hashlib.scrypt`
- Groq API
- PyPDF

**Deployment**
- Render Static Site (frontend)
- Render Web Service (backend)

## Project Structure

```text
StudyMate-AI/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── check_models.py
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Run Locally

### Prerequisites

- Python 3.10+
- Node.js and npm
- A Groq API key

### 1. Clone the repository

```bash
git clone https://github.com/viralpatel16/StudyMate-AI.git
cd StudyMate-AI
```

### 2. Set up the backend

From the project root:

**Windows PowerShell**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a file named `.env` inside the `backend` folder:

```env
GROQ_API_KEY=your_groq_api_key
SECRET_KEY=replace_with_a_long_random_secret
```

Generate a secret key locally if needed:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start the API from the `backend` directory:

```powershell
uvicorn main:app --reload
```

Backend: http://127.0.0.1:8000  
Interactive API docs: http://127.0.0.1:8000/docs

### 3. Set up the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite will print the local frontend URL (usually http://localhost:5173).

The frontend API base URL is configured in `frontend/src/api.js`. For local full-stack development, change `API_URL` to:

```js
const API_URL = "http://127.0.0.1:8000";
```

The backend CORS configuration includes the local Vite origin.

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Backend status message |
| GET | `/health` | Health check |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in |
| GET | `/auth/me` | Get current user |
| POST | `/upload` | Upload and extract PDF/TXT text |
| GET | `/materials` | List user's materials |
| GET | `/materials/{material_id}` | Get one material |
| DELETE | `/materials/{material_id}` | Delete a material |
| POST | `/summarize` | Generate study notes |
| POST | `/quiz` | Generate a multiple-choice quiz |
| POST | `/flashcards` | Generate flashcards |
| GET | `/study-content` | Retrieve saved study content |

Most material and study routes require a bearer access token. See the interactive API documentation for request schemas and responses.

## Deployment

The project is deployed on Render as two services.

**Frontend Static Site**
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

**Backend Web Service**
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

Backend environment variables are configured in Render:

- `GROQ_API_KEY` — Groq API key used for AI generation.
- `SECRET_KEY` — private secret used to sign authentication tokens.

Never commit real API keys, passwords, or secret values to the repository. Keep them in your local `.env` file or your hosting provider's environment settings.

## Important Notes

- **Database persistence:** The backend currently uses SQLite in a local database file (`studymate.db`). On Render's free web service, local filesystem data is not guaranteed to persist across restarts or redeployments. Use a persistent disk or managed database before relying on long-term account and study-data storage.
- **AI output:** Review generated notes, quiz answers, and flashcards against your original material before important exams.
- **Privacy:** Avoid uploading confidential or sensitive documents unless you are comfortable processing them through the deployed app and its AI provider.

## Future Improvements

- Persistent managed database for production use
- OCR support for scanned PDFs
- More study modes and customization
- Improved saved-content browsing and study progress tracking

---

**Built as an AI-powered learning project.**
