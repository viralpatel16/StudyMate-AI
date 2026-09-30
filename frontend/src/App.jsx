
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  getToken,
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  getMaterials,
  getMaterial,
  uploadMaterial,
  deleteMaterial as deleteMaterialRequest,
  generateSummary,
  generateQuiz,
  generateFlashcards,
  getStudyContent,
} from "./api";

// -------------------- APP --------------------

const NAV_ITEMS = [
  { id: "dashboard", icon: "⌂", label: "Dashboard" },
  { id: "materials", icon: "▤", label: "My Materials" },
  { id: "summaries", icon: "✧", label: "AI Summaries" },
  { id: "quizzes", icon: "☷", label: "Smart Quizzes" },
  { id: "flashcards", icon: "▣", label: "Flashcards" },
];

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [active, setActive] = useState("dashboard");
  const [materials, setMaterials] = useState([]);
  const [selectedId, setSelectedId] = useState("");

  const [summary, setSummary] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [cards, setCards] = useState([]);

  const [questionCount, setQuestionCount] = useState(5);
  const [cardCount, setCardCount] = useState(8);

  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fileInput = useRef(null);

  const selectedMaterial = useMemo(
    () =>
      materials.find(
        (material) => String(material.id) === String(selectedId)
      ),
    [materials, selectedId]
  );

  const totalQuestions = quiz?.questions?.length || 0;

  // -------------------- CHECK LOGIN --------------------

  useEffect(() => {
    let mounted = true;

    async function checkLogin() {
      if (!getToken()) {
        if (mounted) setAuthLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (mounted) setUser(currentUser);
      } catch {
        logoutUser();
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    checkLogin();

    return () => {
      mounted = false;
    };
  }, []);

  // -------------------- LOAD DATABASE DATA --------------------

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    async function loadSavedData() {
      setError("");

      try {
        const savedMaterials = await getMaterials();

        if (!mounted) return;

        const formattedMaterials = savedMaterials.map((material) => ({
          id: material.id,
          filename: material.filename,
          text: "",
          size: material.file_size,
          type: material.file_type,
          pages: material.pages,
          uploadedAt: material.created_at
            ? new Date(material.created_at).toLocaleDateString()
            : "",
        }));

        setMaterials(formattedMaterials);

        setSelectedId((currentId) => {
          const stillExists = formattedMaterials.some(
            (m) => String(m.id) === String(currentId)
          );

          if (stillExists) return currentId;
          return formattedMaterials.length
            ? String(formattedMaterials[0].id)
            : "";
        });

        // Load saved summaries, quizzes and flashcards for this account.
        const savedContent = await getStudyContent();

        if (mounted) {
          console.log("Saved study content loaded:", savedContent);
        }
      } catch (err) {
        if (mounted) {
          setError(`Could not load your saved data: ${err.message}`);
        }
      }
    }

    loadSavedData();

    return () => {
      mounted = false;
    };
  }, [user]);

  // -------------------- NAVIGATION --------------------

  function goTo(page) {
    setActive(page);
    setError("");
    setNotice("");
  }

  // -------------------- AUTH --------------------

  function handleLogout() {
    logoutUser();
    setUser(null);
    setMaterials([]);
    setSelectedId("");
    setSummary("");
    setQuiz(null);
    setCards([]);
    setActive("dashboard");
    setError("");
    setNotice("");
  }

  // -------------------- UPLOAD --------------------

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    setLoading("upload");
    setError("");
    setNotice("");

    for (const file of files) {
      try {
        const result = await uploadMaterial(file);

        const material = {
          id: result.id,
          filename: result.filename || file.name,
          text: result.text || "",
          size: result.size ?? file.size,
          type: result.file_type || file.type || "Document",
          pages: result.pages ?? null,
          uploadedAt: new Date().toLocaleDateString(),
        };

        setMaterials((previous) => [material, ...previous]);
        setSelectedId(String(material.id));
        setNotice(`${material.filename} uploaded successfully.`);
      } catch (err) {
        setError(`Could not upload ${file.name}: ${err.message}`);
      }
    }

    setLoading("");
    event.target.value = "";
    setActive("materials");
  }

  // -------------------- LOAD FULL MATERIAL TEXT --------------------

  async function getReadyMaterial() {
    if (!selectedMaterial) {
      throw new Error("Please select a study material first.");
    }

    if (selectedMaterial.text?.trim()) {
      return selectedMaterial;
    }

    const fullMaterial = await getMaterial(selectedMaterial.id);

    const ready = {
      ...selectedMaterial,
      text: fullMaterial.extracted_text || "",
      size: fullMaterial.file_size ?? selectedMaterial.size,
      type: fullMaterial.file_type ?? selectedMaterial.type,
      pages: fullMaterial.pages ?? selectedMaterial.pages,
    };

    if (!ready.text.trim()) {
      throw new Error(
        "No readable text was found in this material. Try another file."
      );
    }

    setMaterials((previous) =>
      previous.map((material) =>
        String(material.id) === String(ready.id) ? ready : material
      )
    );

    return ready;
  }

  // -------------------- DELETE MATERIAL --------------------

  async function deleteMaterial(id) {
    const confirmed = window.confirm(
      "Delete this material and its saved summaries, quizzes and flashcards?"
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await deleteMaterialRequest(id);

      setMaterials((previous) =>
        previous.filter((item) => String(item.id) !== String(id))
      );

      if (String(selectedId) === String(id)) {
        setSelectedId("");
        setSummary("");
        setQuiz(null);
        setCards([]);
      }

      setNotice("Material and its saved study content were deleted.");
    } catch (err) {
      setError(`Could not delete material: ${err.message}`);
    }
  }

  // -------------------- AI SUMMARY --------------------

  async function runSummary() {
    setError("");
    setNotice("");
    setLoading("summary");

    try {
      const material = await getReadyMaterial();
      const result = await generateSummary(material);

      const content =
        typeof result === "string"
          ? result
          : result.summary || result.content || result.notes || "";

      if (!content.trim()) {
        throw new Error("The server returned an empty summary.");
      }

      setSummary(content);
      setActive("summaries");
      setNotice("Your exam-ready notes are ready.");
    } catch (err) {
      setError(`Summary failed: ${err.message}`);
    } finally {
      setLoading("");
    }
  }

  // -------------------- AI QUIZ --------------------

  async function runQuiz() {
    setError("");
    setNotice("");
    setLoading("quiz");

    try {
      const material = await getReadyMaterial();
      const result = await generateQuiz(material, questionCount);

      if (!Array.isArray(result.questions) || !result.questions.length) {
        throw new Error("The server returned no quiz questions.");
      }

      setQuiz(result);
      setActive("quizzes");
      setNotice("Your practice quiz is ready.");
    } catch (err) {
      setError(`Quiz generation failed: ${err.message}`);
    } finally {
      setLoading("");
    }
  }

  // -------------------- AI FLASHCARDS --------------------

  async function runFlashcards() {
    setError("");
    setNotice("");
    setLoading("flashcards");

    try {
      const material = await getReadyMaterial();
      const result = await generateFlashcards(material, cardCount);

      const list = Array.isArray(result)
        ? result
        : result.cards || result.flashcards || [];

      if (!list.length) {
        throw new Error("The server returned no flashcards.");
      }

      setCards(list);
      setCardIndex(0);
      setFlipped(false);
      setActive("flashcards");
      setNotice("Your flashcards are ready.");
    } catch (err) {
      setError(`Flashcard generation failed: ${err.message}`);
    } finally {
      setLoading("");
    }
  }

  // -------------------- AUTH LOADING --------------------

  if (authLoading) {
    return (
      <div className="auth-loading">
        <span className="spinner" />
        <p>Loading your StudyMate workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  // -------------------- DASHBOARD --------------------

  function renderDashboard() {
    return (
      <>
        <div className="welcome-panel">
          <div className="welcome-copy">
            <div className="eyebrow">
              <span className="spark">✦</span> YOUR LEARNING SPACE
            </div>

            <h1>
              Hey, {user.name?.split(" ")[0] || "there"} <span>👋</span>
            </h1>

            <p>Ready to make your next study session count?</p>

            <p className="welcome-sub">
              Upload your study material and let AI help you prepare, revise,
              and practice.
            </p>

            <button
              className="primary-btn"
              onClick={() => fileInput.current?.click()}
            >
              <span>＋</span> Upload study material
            </button>
          </div>

          <div className="welcome-art" aria-hidden="true">
            <div className="art-orbit orbit-one"></div>
            <div className="art-orbit orbit-two"></div>
            <div className="art-book">✧</div>
            <div className="art-dot dot-one"></div>
            <div className="art-dot dot-two"></div>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon cyan">▤</div>
            <div>
              <span className="stat-label">My Materials</span>
              <strong>{materials.length}</strong>
              <small>Uploaded study files</small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon purple">✧</div>
            <div>
              <span className="stat-label">AI Summaries</span>
              <strong>{summary ? 1 : 0}</strong>
              <small>Notes in this session</small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon orange">☷</div>
            <div>
              <span className="stat-label">Quiz Questions</span>
              <strong>{totalQuestions}</strong>
              <small>In your current quiz</small>
            </div>
          </div>
        </div>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <h2>Quick actions</h2>
              <p>Jump straight into one of your study tools.</p>
            </div>
          </div>

          <div className="action-grid">
            <button
              className="action-card"
              onClick={() => goTo("materials")}
            >
              <span className="action-icon cyan">▤</span>
              <strong>My Materials</strong>
              <span>Upload and organize your notes.</span>
              <b>Open tool <i>→</i></b>
            </button>

            <button
              className="action-card"
              onClick={() => goTo("summaries")}
            >
              <span className="action-icon purple">✧</span>
              <strong>AI Summaries</strong>
              <span>Turn long material into revision notes.</span>
              <b>Open tool <i>→</i></b>
            </button>

            <button
              className="action-card"
              onClick={() => goTo("quizzes")}
            >
              <span className="action-icon orange">☷</span>
              <strong>Smart Quizzes</strong>
              <span>Practice with generated questions.</span>
              <b>Open tool <i>→</i></b>
            </button>

            <button
              className="action-card"
              onClick={() => goTo("flashcards")}
            >
              <span className="action-icon green">▣</span>
              <strong>Flashcards</strong>
              <span>Review key concepts with quick cards.</span>
              <b>Open tool <i>→</i></b>
            </button>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <h2>Recent materials</h2>
              <p>Your latest uploaded files.</p>
            </div>

            <button className="text-btn" onClick={() => goTo("materials")}>
              View all →
            </button>
          </div>

          {materials.length ? (
            <div className="material-list">
              {materials.slice(0, 3).map((material) => (
                <MaterialRow
                  key={material.id}
                  material={material}
                  onSelect={() => {
                    setSelectedId(String(material.id));
                    goTo("materials");
                  }}
                  onDelete={() => deleteMaterial(material.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <div className="empty-icon">▤</div>
              <strong>No materials yet</strong>
              <p>Upload a PDF or text file to get started.</p>
            </div>
          )}
        </section>
      </>
    );
  }

  // -------------------- MATERIALS PAGE --------------------

  function renderMaterials() {
    return (
      <>
        <PageTitle
          title="My Materials"
          subtitle="Keep your study files organized in one place."
        />

        <div className="upload-strip">
          <div className="upload-symbol">↑</div>

          <div className="upload-text">
            <strong>Upload your study material</strong>
            <span>Choose a PDF or TXT file to get started.</span>
          </div>

          <button
            className="primary-btn"
            onClick={() => fileInput.current?.click()}
          >
            ＋ Choose files
          </button>
        </div>

        <div className="section-heading material-title">
          <div>
            <h2>All materials</h2>
            <p>{materials.length} files in your library</p>
          </div>
        </div>

        {materials.length ? (
          <div className="material-list">
            {materials.map((material) => (
              <div
                className={`material-row ${
                  String(selectedId) === String(material.id)
                    ? "selected"
                    : ""
                }`}
                key={material.id}
              >
                <div className="file-icon">
                  {material.type === "TXT" ? "TXT" : "PDF"}
                </div>

                <button
                  className="material-main"
                  onClick={() => setSelectedId(String(material.id))}
                >
                  <strong>{material.filename}</strong>
                  <span>
                    {formatSize(material.size)}
                    {material.pages ? ` · ${material.pages} pages` : ""}
                    {material.uploadedAt
                      ? ` · Added ${material.uploadedAt}`
                      : ""}
                  </span>
                </button>

                <button
                  className="small-btn"
                  onClick={() => setSelectedId(String(material.id))}
                >
                  {String(selectedId) === String(material.id)
                    ? "Selected"
                    : "Select"}
                </button>

                <button
                  className="icon-btn danger"
                  onClick={() => deleteMaterial(material.id)}
                  title="Delete material"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <h3>Your library is empty</h3>
            <p>
              Upload your first study file to create summaries, quizzes, and
              flashcards.
            </p>
          </div>
        )}

        {selectedMaterial && (
          <div className="selected-note">
            <span className="status-dot"></span>
            Selected: <strong>{selectedMaterial.filename}</strong>
          </div>
        )}
      </>
    );
  }

  // -------------------- SUMMARIES PAGE --------------------

  function renderSummaries() {
    return (
      <>
        <PageTitle
          title="AI Summaries"
          subtitle="Turn your study material into clear, exam-ready notes."
        />

        <ToolPanel
          materials={materials}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selectedMaterial={selectedMaterial}
          onGenerate={runSummary}
          loading={loading === "summary"}
          buttonText="Generate summary"
        />

        {summary ? (
          <section className="output-panel">
            <div className="output-heading">
              <div>
                <h2>Study notes</h2>
                <p>{selectedMaterial?.filename || "Your material"}</p>
              </div>
              <span className="ai-badge">✦ AI GENERATED</span>
            </div>

            <article className="study-notes">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary}
              </ReactMarkdown>
            </article>
          </section>
        ) : (
          <EmptyHint text="Your revision notes will appear here after you generate a summary." />
        )}
      </>
    );
  }

  // -------------------- QUIZZES PAGE --------------------

  function renderQuizzes() {
    return (
      <>
        <PageTitle
          title="Smart Quizzes"
          subtitle="Test your understanding with AI-generated questions."
        />

        <ToolPanel
          materials={materials}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selectedMaterial={selectedMaterial}
          onGenerate={runQuiz}
          loading={loading === "quiz"}
          buttonText="Generate quiz"
        >
          <label className="field-label">Number of questions</label>
          <select
            className="field-select"
            value={questionCount}
            onChange={(event) =>
              setQuestionCount(Number(event.target.value))
            }
          >
            {[3, 5, 10, 15, 20].map((number) => (
              <option key={number} value={number}>
                {number} questions
              </option>
            ))}
          </select>
        </ToolPanel>

        {quiz?.questions?.length ? (
          <QuizView key={JSON.stringify(quiz)} quiz={quiz} />
        ) : (
          <EmptyHint text="Choose your material and question count to create a practice quiz." />
        )}
      </>
    );
  }

  // -------------------- FLASHCARDS PAGE --------------------

  function renderFlashcards() {
    const currentCard = cards[cardIndex];

    return (
      <>
        <PageTitle
          title="Flashcards"
          subtitle="Remember key terms and concepts with active recall."
        />

        <ToolPanel
          materials={materials}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selectedMaterial={selectedMaterial}
          onGenerate={runFlashcards}
          loading={loading === "flashcards"}
          buttonText="Create flashcards"
        >
          <label className="field-label">Number of cards</label>
          <select
            className="field-select"
            value={cardCount}
            onChange={(event) => setCardCount(Number(event.target.value))}
          >
            {[5, 8, 10, 15, 20, 30].map((number) => (
              <option key={number} value={number}>
                {number} cards
              </option>
            ))}
          </select>
        </ToolPanel>

        {currentCard ? (
          <div className="flashcard-area">
            <div className="flashcard-count">
              CARD {cardIndex + 1} OF {cards.length}
            </div>

            <button
              className={`flashcard ${flipped ? "flipped" : ""}`}
              onClick={() => setFlipped((current) => !current)}
            >
              <span className="flashcard-label">
                {flipped ? "ANSWER" : "QUESTION"}
              </span>

              <strong>
                {flipped
                  ? currentCard.back ||
                    currentCard.answer ||
                    currentCard.definition ||
                    "No answer provided."
                  : currentCard.front ||
                    currentCard.question ||
                    currentCard.term ||
                    "No question provided."}
              </strong>

              <small>
                Click to {flipped ? "see question" : "flip for answer"}
              </small>
            </button>

            <div className="flashcard-controls">
              <button
                className="secondary-btn"
                disabled={cardIndex === 0}
                onClick={() => {
                  setCardIndex((index) => index - 1);
                  setFlipped(false);
                }}
              >
                ← Previous
              </button>

              <button
                className="primary-btn"
                disabled={cardIndex === cards.length - 1}
                onClick={() => {
                  setCardIndex((index) => index + 1);
                  setFlipped(false);
                }}
              >
                Next card →
              </button>
            </div>
          </div>
        ) : (
          <EmptyHint text="Generate flashcards from your study material to start reviewing." />
        )}
      </>
    );
  }

  // -------------------- MAIN LAYOUT --------------------

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <strong>
              StudyMate <span>AI</span>
            </strong>
            <small>Your study companion</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                active === item.id ? "active" : ""
              }`}
              onClick={() => goTo(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-avatar">
            {(user.name || "V").charAt(0).toUpperCase()}
          </div>

          <div className="profile-info">
            <strong>{user.name || "Student"}</strong>
            <small>{user.email || "Student account"}</small>
          </div>

          <button
            className="small-btn logout-btn"
            onClick={handleLogout}
            title="Log out"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>STUDYMATE</span>
            <i>/</i>
            <strong>WORKSPACE</strong>
          </div>

          <div className="topbar-right">
            <span className="online-dot"></span>
            <span>Workspace</span>
            <div className="top-avatar">
              {(user.name || "V").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="alert error-alert">
              <span>!</span>
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}

          {notice && (
            <div className="alert success-alert">
              <span>✓</span>
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}

          {active === "dashboard" && renderDashboard()}
          {active === "materials" && renderMaterials()}
          {active === "summaries" && renderSummaries()}
          {active === "quizzes" && renderQuizzes()}
          {active === "flashcards" && renderFlashcards()}
        </div>
      </main>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        multiple
        hidden
        onChange={handleUpload}
      />

      {loading === "upload" && (
        <div className="loading-toast">
          <span className="spinner"></span>
          Uploading material...
        </div>
      )}
    </div>
  );
}

// -------------------- AUTH SCREEN --------------------

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const authenticatedUser =
        mode === "register"
          ? await registerUser(name, email, password)
          : await loginUser(email, password);

      onAuth(authenticatedUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">✦</div>
          <div>
            <strong>
              StudyMate <span>AI</span>
            </strong>
            <small>Your study companion</small>
          </div>
        </div>

        <div className="eyebrow">YOUR PERSONAL STUDY SPACE</div>

        <h1>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>

        <p className="auth-subtitle">
          {mode === "login"
            ? "Log in to continue learning with StudyMate AI."
            : "Create an account to save and organize your study materials."}
        </p>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label className="field-label">Full name</label>
              <input
                className="auth-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                required
                minLength={2}
              />
            </>
          )}

          <label className="field-label">Email address</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />

          <label className="field-label">Password</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={
              mode === "register"
                ? "At least 8 characters"
                : "Enter your password"
            }
            minLength={mode === "register" ? 8 : undefined}
            required
          />

          {error && <div className="alert error-alert">{error}</div>}

          <button className="primary-btn auth-submit" disabled={busy}>
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Log in →"
                : "Create account →"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login"
            ? "Don't have an account?"
            : "Already have an account?"}

          <button
            type="button"
            onClick={() => {
              setMode((current) =>
                current === "login" ? "register" : "login"
              );
              setError("");
            }}
          >
            {mode === "login" ? "Create account" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------- PAGE COMPONENTS --------------------

function PageTitle({ title, subtitle }) {
  return (
    <div className="page-title">
      <div className="eyebrow">STUDYMATE / WORKSPACE</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function ToolPanel({
  materials,
  selectedId,
  setSelectedId,
  selectedMaterial,
  onGenerate,
  loading,
  buttonText,
  children,
}) {
  return (
    <div className="tool-panel">
      <div className="tool-panel-top">
        <div>
          <strong>Choose your study material</strong>
          <p>Select a file to use as the source for your AI tool.</p>
        </div>
        <span className="tool-spark">✦</span>
      </div>

      <label className="field-label">Study material</label>

      <select
        className="field-select"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        <option value="">Select a material</option>
        {materials.map((material) => (
          <option key={material.id} value={String(material.id)}>
            {material.filename}
          </option>
        ))}
      </select>

      {children}

      {selectedMaterial && (
        <div className="chosen-file">
          Selected: <strong>{selectedMaterial.filename}</strong>
        </div>
      )}

      <button
        className="primary-btn generate-btn"
        disabled={!selectedMaterial || loading}
        onClick={onGenerate}
      >
        {loading ? (
          <>
            <span className="spinner"></span>
            Working...
          </>
        ) : (
          <>✦ {buttonText}</>
        )}
      </button>
    </div>
  );
}

function MaterialRow({ material, onSelect, onDelete }) {
  return (
    <div className="material-row">
      <div className="file-icon">
        {material.type === "TXT" ? "TXT" : "PDF"}
      </div>

      <button className="material-main" onClick={onSelect}>
        <strong>{material.filename}</strong>
        <span>
          {formatSize(material.size)}
          {material.uploadedAt ? ` · Added ${material.uploadedAt}` : ""}
        </span>
      </button>

      <button className="small-btn" onClick={onSelect}>
        View
      </button>

      <button
        className="icon-btn danger"
        onClick={onDelete}
        title="Delete material"
      >
        ×
      </button>
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div className="empty-state output-empty">
      <div className="empty-icon">✧</div>
      <strong>Nothing here yet</strong>
      <p>{text}</p>
    </div>
  );
}

// -------------------- QUIZ VIEW --------------------

function QuizView({ quiz }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const questions = quiz.questions || [];

  const correct = questions.reduce((sum, question, index) => {
    const correctAnswer = String(question.answer || "")
      .trim()
      .charAt(0)
      .toUpperCase();

    return sum + (answers[index] === correctAnswer ? 1 : 0);
  }, 0);

  return (
    <section className="output-panel quiz-panel">
      <div className="output-heading">
        <div>
          <h2>{quiz.title || "Practice quiz"}</h2>
          <p>
            {questions.length} questions · Choose one answer per question
          </p>
        </div>
      </div>

      {questions.map((question, index) => {
        const options = (question.options || []).slice(0, 4);

        return (
          <div className="question-card" key={index}>
            <div className="question-number">
              QUESTION {index + 1}
            </div>

            <h3>{question.question}</h3>

            <div className="option-list">
              {options.map((option, optionIndex) => {
                const letter = ["A", "B", "C", "D"][optionIndex];
                const chosen = answers[index] === letter;
                const right =
                  String(question.answer || "")
                    .trim()
                    .charAt(0)
                    .toUpperCase() === letter;

                return (
                  <button
                    key={optionIndex}
                    disabled={submitted}
                    className={`option ${
                      chosen ? "chosen" : ""
                    } ${
                      submitted && right ? "right" : ""
                    } ${
                      submitted && chosen && !right ? "wrong" : ""
                    }`}
                    onClick={() =>
                      setAnswers((previous) => ({
                        ...previous,
                        [index]: letter,
                      }))
                    }
                  >
                    <span className="option-letter">{letter}</span>
                    <span>
                      {String(option).replace(/^[A-D][.)]\s*/, "")}
                    </span>
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div className="explanation">
                <strong>
                  {String(question.answer || "")
                    .trim()
                    .charAt(0)
                    .toUpperCase() === answers[index]
                    ? "Correct!"
                    : `Correct answer: ${question.answer}`}
                </strong>

                {question.explanation && <p>{question.explanation}</p>}
              </div>
            )}
          </div>
        );
      })}

      {!submitted ? (
        <button
          className="primary-btn generate-btn"
          disabled={Object.keys(answers).length !== questions.length}
          onClick={() => setSubmitted(true)}
        >
          Submit answers
        </button>
      ) : (
        <div className="score-box">
          <strong>
            Your score: {correct} / {questions.length}
          </strong>
          <button
            className="secondary-btn"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}

// -------------------- UTILITIES --------------------

function formatSize(bytes = 0) {
  if (!bytes) return "Size unavailable";

  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default App;