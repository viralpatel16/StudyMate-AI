
import os
import json
import re
import sqlite3
import hashlib
import secrets
from io import BytesIO
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from groq import Groq
from pydantic import BaseModel, EmailStr
from pypdf import PdfReader

load_dotenv()

app = FastAPI(title="StudyMate AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173","https://studymate-ai-4uu1.onrender.com/", "https://studymate-ai-backend-uwsu.onrender.com/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE = "studymate.db"
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24
security = HTTPBearer()


# -------------------- DATABASE --------------------

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            pages INTEGER,
            extracted_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            material_id INTEGER,
            filename TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(material_id) REFERENCES materials(id)
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            material_id INTEGER,
            filename TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(material_id) REFERENCES materials(id)
        );

        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            material_id INTEGER,
            filename TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(material_id) REFERENCES materials(id)
        );
        """)
        conn.execute("PRAGMA foreign_keys = ON")


init_db()


def now():
    return datetime.now(timezone.utc).isoformat()


# -------------------- PASSWORDS / AUTH --------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    hashed = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1
    )
    return salt.hex() + ":" + hashed.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=2**14,
            r=8,
            p=1
        )
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int):
    if not SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="SECRET_KEY is not configured in backend/.env"
        )

    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expires},
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    if not SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server auth is not configured.")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", ""))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired login. Please log in again.")

    with get_db() as conn:
        user = conn.execute(
            "SELECT id, name, email FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="User account not found.")

    return dict(user)


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/auth/register")
def register(request: RegisterRequest):
    name = request.name.strip()
    email = str(request.email).strip().lower()

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your name.")
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    try:
        with get_db() as conn:
            cursor = conn.execute(
                """INSERT INTO users (name, email, password_hash, created_at)
                   VALUES (?, ?, ?, ?)""",
                (name, email, hash_password(request.password), now())
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = {"id": user_id, "name": name, "email": email}
    return {
        "user": user,
        "access_token": create_access_token(user_id),
        "token_type": "bearer"
    }


@app.post("/auth/login")
def login(request: LoginRequest):
    email = str(request.email).strip().lower()

    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()

    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return {
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        },
        "access_token": create_access_token(user["id"]),
        "token_type": "bearer"
    }


@app.get("/auth/me")
def me(user=Depends(get_current_user)):
    return {"user": user}


# -------------------- MATERIALS --------------------

@app.get("/")
def home():
    return {"message": "StudyMate AI backend is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    filename = file.filename or "uploaded_file"
    extension = filename.lower().rsplit(".", 1)[-1]

    if extension not in ["pdf", "txt"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported.")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File is too large. Maximum size is 15 MB.")

    try:
        if extension == "pdf":
            reader = PdfReader(BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            pages = len(reader.pages)
        else:
            text = content.decode("utf-8", errors="replace")
            pages = None
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"File processing failed: {error}")

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text was extracted. Scanned PDFs need OCR."
        )

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO materials
               (user_id, filename, file_type, file_size, pages, extracted_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user["id"], filename, extension.upper(), len(content), pages, text, now())
        )
        material_id = cursor.lastrowid

    return {
        "id": material_id,
        "filename": filename,
        "file_type": extension.upper(),
        "size": len(content),
        "pages": pages,
        "text": text,
        "message": "File uploaded and saved successfully!"
    }


@app.get("/materials")
def list_materials(user=Depends(get_current_user)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, filename, file_type, file_size, pages, created_at
               FROM materials WHERE user_id = ? ORDER BY id DESC""",
            (user["id"],)
        ).fetchall()
    return {"materials": [dict(row) for row in rows]}


@app.get("/materials/{material_id}")
def get_material(material_id: int, user=Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            """SELECT id, filename, file_type, file_size, pages,
                      extracted_text, created_at
               FROM materials WHERE id = ? AND user_id = ?""",
            (material_id, user["id"])
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Material not found.")
    return dict(row)


@app.delete("/materials/{material_id}")
def delete_material(material_id: int, user=Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM materials WHERE id = ? AND user_id = ?",
            (material_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Material not found.")

        conn.execute("DELETE FROM summaries WHERE material_id = ? AND user_id = ?", (material_id, user["id"]))
        conn.execute("DELETE FROM quizzes WHERE material_id = ? AND user_id = ?", (material_id, user["id"]))
        conn.execute("DELETE FROM flashcards WHERE material_id = ? AND user_id = ?", (material_id, user["id"]))
        conn.execute("DELETE FROM materials WHERE id = ? AND user_id = ?", (material_id, user["id"]))

    return {"message": "Material and its saved study content were deleted."}


# -------------------- AI HELPERS --------------------

class StudyRequest(BaseModel):
    filename: str = "Study material"
    text: str
    material_id: int | None = None
    style: str = "exam"
    num_questions: int = 5
    num_cards: int = 10


def verify_material_access(material_id, user_id):
    if material_id is None:
        return
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM materials WHERE id = ? AND user_id = ?",
            (material_id, user_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Material not found for this account.")


def groq_client():
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")
    return Groq(api_key=key)


def ai_text(system_prompt, user_prompt, json_mode=False):
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    completion = groq_client().chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3,
        **kwargs
    )
    return completion.choices[0].message.content or ""


def extract_json(content):
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            return json.loads(content[start:end + 1])
        raise HTTPException(status_code=502, detail="AI returned invalid structured data.")


# -------------------- SUMMARIES --------------------

@app.post("/summarize")
def summarize_material(request: StudyRequest, user=Depends(get_current_user)):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No extracted text was provided.")

    verify_material_access(request.material_id, user["id"])
    text = text[:30000]

    system_prompt = """
You are StudyMate AI, an expert university exam tutor.
Create genuinely condensed, clear, exam-ready study notes based ONLY on the supplied source.
Do not copy the source paragraph-by-paragraph. Synthesize, simplify, group related ideas,
remove repetition, and prioritize concepts likely to matter for revision.
Use Markdown headings, bullets, numbered steps, and proper Markdown tables ONLY when
comparing items or organizing genuinely tabular data. Never create fake tables by using
pipes in ordinary prose. Keep table columns consistent and use the standard separator row.
Include: title, short overview, key concepts explained simply, important processes/formulas
if present in source, comparisons where useful, and a quick revision recap.
Preserve the source's terminology and don't invent missing details. Mention when source
material is unclear or incomplete. Keep the notes concise relative to the source.
"""

    try:
        summary = ai_text(
            system_prompt,
            f"Create exam-ready notes from this study material.\nFilename: {request.filename}\n\nSOURCE:\n{text}"
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Summary generation failed: {error}")

    with get_db() as conn:
        conn.execute(
            """INSERT INTO summaries (user_id, material_id, filename, content, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (user["id"], request.material_id, request.filename, summary, now())
        )

    return {"filename": request.filename, "summary": summary}


# -------------------- QUIZZES --------------------

@app.post("/quiz")
def generate_quiz(request: StudyRequest, user=Depends(get_current_user)):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No source text provided.")
    verify_material_access(request.material_id, user["id"])

    count = max(3, min(int(request.num_questions), 20))
    prompt = f"""
Create exactly {count} multiple-choice questions based only on this material.
Return valid JSON with this structure:
{{
  "title": "Short quiz title",
  "questions": [
    {{
      "question": "Question text",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "answer": "A",
      "explanation": "Brief explanation"
    }}
  ]
}}
Use four plausible options per question. The answer must be only A, B, C, or D.
Avoid ambiguous questions and avoid repeating the same concept.
Material filename: {request.filename}
SOURCE:
{text[:24000]}
"""
    try:
        data = extract_json(ai_text(
            "You create accurate educational quizzes. Output only valid JSON.",
            prompt,
            json_mode=True
        ))
        questions = data.get("questions", [])
        if not isinstance(questions, list) or not questions:
            raise ValueError("No questions in response.")
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Quiz generation failed: {error}")

    result = {"title": data.get("title", f"{request.filename} Quiz"), "questions": questions}
    with get_db() as conn:
        conn.execute(
            """INSERT INTO quizzes (user_id, material_id, filename, content, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (user["id"], request.material_id, request.filename, json.dumps(result), now())
        )
    return result


# -------------------- FLASHCARDS --------------------

@app.post("/flashcards")
def generate_flashcards(request: StudyRequest, user=Depends(get_current_user)):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No source text provided.")
    verify_material_access(request.material_id, user["id"])

    count = max(3, min(int(request.num_cards), 30))
    prompt = f"""
Create exactly {count} useful study flashcards from the material.
Return valid JSON:
{{
  "cards": [
    {{"front": "Question or key term", "back": "Clear concise answer"}}
  ]
}}
Test important definitions, concepts, steps, and distinctions.
Each front should test one idea; each back should be short and accurate.
Use only the supplied source.
Filename: {request.filename}
SOURCE:
{text[:24000]}
"""
    try:
        data = extract_json(ai_text(
            "You create concise, accurate active-recall flashcards. Output only valid JSON.",
            prompt,
            json_mode=True
        ))
        cards = data.get("cards", [])
        if not isinstance(cards, list) or not cards:
            raise ValueError("No cards in response.")
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Flashcard generation failed: {error}")

    result = {"cards": cards}
    with get_db() as conn:
        conn.execute(
            """INSERT INTO flashcards (user_id, material_id, filename, content, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (user["id"], request.material_id, request.filename, json.dumps(result), now())
        )
    return result


# -------------------- SAVED STUDY CONTENT --------------------

@app.get("/study-content")
def get_study_content(user=Depends(get_current_user)):
    with get_db() as conn:
        summaries = conn.execute(
            "SELECT id, material_id, filename, content, created_at FROM summaries WHERE user_id = ? ORDER BY id DESC",
            (user["id"],)
        ).fetchall()
        quizzes = conn.execute(
            "SELECT id, material_id, filename, content, created_at FROM quizzes WHERE user_id = ? ORDER BY id DESC",
            (user["id"],)
        ).fetchall()
        flashcards = conn.execute(
            "SELECT id, material_id, filename, content, created_at FROM flashcards WHERE user_id = ? ORDER BY id DESC",
            (user["id"],)
        ).fetchall()

    return {
        "summaries": [dict(row) for row in summaries],
        "quizzes": [
            {**dict(row), "content": json.loads(row["content"])}
            for row in quizzes
        ],
        "flashcards": [
            {**dict(row), "content": json.loads(row["content"])}
            for row in flashcards
        ]
    }