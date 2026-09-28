function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-8 py-5">
        <h1 className="text-2xl font-bold">
          StudyMate <span className="text-cyan-400">AI</span>
        </h1>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="mb-3 text-sm font-medium text-cyan-400">
          YOUR PERSONAL AI STUDY ASSISTANT
        </p>

        <h2 className="text-4xl font-bold">
          Study smarter, not harder.
        </h2>

        <p className="mt-4 max-w-xl text-slate-400">
          Upload your notes, generate summaries, practice with AI
          quizzes and prepare for your exams.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["📄", "AI Summaries", "Turn lengthy notes into concise summaries."],
            ["🧠", "Smart Quizzes", "Test your knowledge with AI-generated questions."],
            ["⚡", "Flashcards", "Revise important concepts quickly."],
          ].map(([icon, title, description]) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="text-3xl">{icon}</div>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-400">
                {description}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App