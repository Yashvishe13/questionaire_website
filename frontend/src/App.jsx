import { useState, useEffect, useRef } from "react";
import {
  SECTIONS,
  SPLITS,
  QUESTIONS_PER_SECTION,
  STORAGE_KEY,
  COMPLETED_KEY,
  PENDING_PARTICIPANT_KEY,
  START_DRAFT_KEY,
} from "./constants";

// ── Utilities ────────────────────────────────────────────────────────────────

function getSplitIndex(birthMonth) {
  const m = parseInt(birthMonth, 10);
  return m <= 6 ? 0 : 1;
}

function createId(prefix) {
  const token =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${token}`;
}

function getPendingParticipantId() {
  const existing = localStorage.getItem(PENDING_PARTICIPANT_KEY);
  if (existing) return existing;
  const id = createId("P");
  localStorage.setItem(PENDING_PARTICIPANT_KEY, id);
  return id;
}

function buildTrials(birthMonth) {
  const splitIndex = getSplitIndex(birthMonth);
  const split = SPLITS[splitIndex];
  const trials = [];

  SECTIONS.forEach((section, sectionIndex) => {
    split.questionIndices.forEach((qIdx, i) => {
      const q = section.questions[qIdx];
      trials.push({
        id: `${section.id}-${q.id}`,
        section,
        sectionIndex: sectionIndex + 1,
        questionNumber: i + 1,
        questionsInSection: QUESTIONS_PER_SECTION,
        questionDef: q,
        audio: q.audio,
      });
    });
  });

  return trials;
}

function createSession(participantId, birthMonth, musicBackground) {
  return {
    participantId,
    birthMonth,
    demographics: {
      birthMonth,
      musicBackground: musicBackground.value,
      musicBackgroundLabel: musicBackground.label,
    },
    contactInfo: null,
    contactSubmittedAt: null,
    sessionId: createId("session"),
    startedAt: new Date().toISOString(),
    submittedAt: null,
    instructionsSeen: false,
    seenSectionIds: [],
    currentIndex: 0,
    splitIndex: getSplitIndex(birthMonth),
    trials: buildTrials(birthMonth),
    responses: {},
  };
}

function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistSession(sess) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sess));
}

function buildPayload(sess) {
  return {
    participantId: sess.participantId,
    birthMonth: sess.birthMonth,
    demographics: sess.demographics,
    contactInfo: sess.contactInfo || null,
    contactSubmittedAt: sess.contactSubmittedAt || null,
    sessionId: sess.sessionId,
    startedAt: sess.startedAt,
    submittedAt: sess.submittedAt,
    responseCount: Object.keys(sess.responses).length,
    sectionCount: SECTIONS.length,
    splitIndex: sess.splitIndex,
    trials: sess.trials.map((trial, i) => ({
      index: i + 1,
      trialId: trial.id,
      sectionId: trial.section.id,
      sectionLabel: trial.section.label,
      questionNumber: trial.questionNumber,
      questionId: trial.questionDef.id,
      audio: trial.audio,
      response: sess.responses[trial.id] || null,
    })),
  };
}

async function postToApi(payload) {
  const res = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(payload));
    throw new Error(`Submission failed: ${res.status}`);
  }
}

function getRestoredChoice(sess) {
  const trial = sess.trials[sess.currentIndex];
  const existing = sess.responses[trial.id];
  if (!existing) return "";
  return existing.displayChoice || "";
}

function applyResponse(sess, choiceVal, shownAt) {
  if (!choiceVal) return null;
  const trial = sess.trials[sess.currentIndex];
  const timeSpentMs = shownAt != null ? Date.now() - shownAt : null;
  return {
    ...sess,
    responses: {
      ...sess.responses,
      [trial.id]: {
        trialId: trial.id,
        sectionId: trial.section.id,
        sectionLabel: trial.section.label,
        questionNumber: trial.questionNumber,
        questionId: trial.questionDef.id,
        displayChoice: choiceVal,
        audio: trial.audio,
        timeSpentMs,
        answeredAt: new Date().toISOString(),
      },
    },
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("start");
  const [session, setSession] = useState(null);
  const [choice, setChoice] = useState("");
  const [validationMsg, setValidationMsg] = useState("");
  const [startValidation, setStartValidation] = useState("");
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [contactInfo, setContactInfo] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [contactFeedbackVisible, setContactFeedbackVisible] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [startDraft, setStartDraft] = useState({ birthMonth: "", musicBackground: "" });

  const syncTimer = useRef(null);
  const pendingId = useRef(getPendingParticipantId());
  const questionShownAt = useRef(null);

  function markQuestionShown() {
    questionShownAt.current = Date.now();
  }

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setSession(saved);
      if (saved.submittedAt) {
        setScreen("complete");
        setContactInfo(saved.contactInfo || "");
        setContactFeedbackVisible(Boolean(saved.contactInfo));
      }
    }
    const raw = localStorage.getItem(START_DRAFT_KEY);
    if (raw) {
      try {
        setStartDraft(JSON.parse(raw));
      } catch {
        localStorage.removeItem(START_DRAFT_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const flush = () => {
      if (!session || session.submittedAt || screen !== "questionnaire" || !choice) return;
      const updated = applyResponse(session, choice);
      if (updated) {
        persistSession(updated);
        void fetch("/api/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(updated)),
        }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [session, screen, choice]);

  function queueSync(sess, immediate) {
    if (!sess || sess.submittedAt) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const run = () => {
      syncTimer.current = null;
      void fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(sess)),
      }).catch(() => {});
    };
    if (immediate) { run(); return; }
    syncTimer.current = setTimeout(run, 550);
  }

  function openSectionModalIfNew(sess) {
    const trial = sess.trials[sess.currentIndex];
    const seen = sess.seenSectionIds || [];
    const isNew = !seen.includes(trial.section.id);
    setShowSectionModal(isNew);
    if (!isNew) markQuestionShown();
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleStartSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const birthMonth = form.elements["birth-month"].value;
    const sel = form.elements["music-background"];
    if (!birthMonth) {
      setStartValidation("Choose a birth month before starting.");
      return;
    }
    if (!sel.value) {
      setStartValidation("Choose a musical background before starting.");
      return;
    }
    const musicBackground = {
      value: sel.value,
      label: sel.options[sel.selectedIndex].text.replace(/\s+/g, " ").trim(),
    };
    const sess = createSession(pendingId.current, birthMonth, musicBackground);
    localStorage.removeItem(START_DRAFT_KEY);
    persistSession(sess);
    setSession(sess);
    setStartValidation("");
    setStartDraft({ birthMonth: "", musicBackground: "" });
    setScreen("instructions");
  }

  function handleBeginQuestions() {
    if (!session) return;
    const updated = { ...session, instructionsSeen: true };
    persistSession(updated);
    setSession(updated);
    openSectionModalIfNew(updated);
    setChoice(getRestoredChoice(updated));
    setValidationMsg("");
    setScreen("questionnaire");
  }

  function handleStartSection() {
    if (!session) return;
    const trial = session.trials[session.currentIndex];
    const seen = [...(session.seenSectionIds || [])];
    if (!seen.includes(trial.section.id)) seen.push(trial.section.id);
    const updated = { ...session, seenSectionIds: seen };
    persistSession(updated);
    setSession(updated);
    setShowSectionModal(false);
    markQuestionShown();
  }

  function handleChoiceChange(val) {
    setChoice(val);
    setValidationMsg("");
    const updated = applyResponse(session, val, questionShownAt.current);
    if (updated) {
      persistSession(updated);
      setSession(updated);
      queueSync(updated, false);
    }
  }

  function handleNext(e) {
    e.preventDefault();
    if (!choice) {
      setValidationMsg("Choose an answer before continuing.");
      return;
    }
    let updated = applyResponse(session, choice, questionShownAt.current);
    if (!updated) return;
    const total = updated.trials.length;

    if (updated.currentIndex < total - 1) {
      updated = { ...updated, currentIndex: updated.currentIndex + 1 };
      persistSession(updated);
      setSession(updated);
      queueSync(updated, true);
      openSectionModalIfNew(updated);
      setChoice(getRestoredChoice(updated));
      setValidationMsg("");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsSaving(true);
    updated = { ...updated, submittedAt: new Date().toISOString() };
    persistSession(updated);
    setSession(updated);
    const payload = buildPayload(updated);

    postToApi(payload)
      .catch(() => {
        setSaveMessage(
          "The server did not accept the submission. A local JSON copy was saved in this browser.",
        );
      })
      .finally(() => {
        setIsSaving(false);
        localStorage.removeItem(START_DRAFT_KEY);
        setContactInfo(updated.contactInfo || "");
        setContactFeedbackVisible(Boolean(updated.contactInfo));
        setScreen("complete");
      });
  }

  function handleBack() {
    if (!session || session.currentIndex === 0) return;
    let updated = session;
    if (choice) {
      updated = applyResponse(session, choice, questionShownAt.current) || session;
      queueSync(updated, true);
    }
    updated = { ...updated, currentIndex: updated.currentIndex - 1 };
    persistSession(updated);
    setSession(updated);
    openSectionModalIfNew(updated);
    setChoice(getRestoredChoice(updated));
    setValidationMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleResumeContinue() {
    if (!session || session.submittedAt) return;
    if (!session.instructionsSeen) {
      setScreen("instructions");
      return;
    }
    openSectionModalIfNew(session);
    setChoice(getRestoredChoice(session));
    setValidationMsg("");
    setScreen("questionnaire");
  }

  function handleResumeRestart() {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COMPLETED_KEY);
    localStorage.removeItem(START_DRAFT_KEY);
    localStorage.removeItem(PENDING_PARTICIPANT_KEY);
    pendingId.current = getPendingParticipantId();
    setSession(null);
    setScreen("start");
    setChoice("");
    setValidationMsg("");
    setStartValidation("");
    setStartDraft({ birthMonth: "", musicBackground: "" });
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    if (!session) return;
    const info = contactInfo.trim() || null;
    const updated = {
      ...session,
      contactInfo: info,
      contactSubmittedAt: new Date().toISOString(),
    };
    persistSession(updated);
    setSession(updated);
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(buildPayload(updated)));
    if (!info) { setContactFeedbackVisible(false); return; }
    try { await postToApi(buildPayload(updated)); } catch { /* swallow */ }
    setContactSaved(true);
  }

  function updateStartDraft(field, value) {
    const draft = { ...startDraft, [field]: value };
    setStartDraft(draft);
    if (!session && (draft.birthMonth || draft.musicBackground)) {
      localStorage.setItem(START_DRAFT_KEY, JSON.stringify(draft));
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const trial = session ? session.trials[session.currentIndex] : null;
  const total = session ? session.trials.length : 0;
  const progress = trial ? ((session.currentIndex + 1) / total) * 100 : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="app-shell">
      {/* ── Start screen ── */}
      {screen === "start" && (
        <section className="intro-panel" id="start-screen">
          <div className="study-copy">
            <p className="thank-you-note">Thank you for participating in this survey.</p>
            <h1>Compare two edited clips and decide which one is farther from the original.</h1>
            <p>
              You will complete 4 sections with 2 questions each. Each question includes an
              original clip and two edited versions. Focus on the specified musical aspect for
              each section.
            </p>
          </div>

          {!session ? (
            <form className="start-form" onSubmit={handleStartSubmit}>
              <fieldset className="demographic-fieldset">
                <legend>Demographic survey</legend>

                <label htmlFor="participant-id">Participant ID</label>
                <input
                  id="participant-id"
                  name="participant-id"
                  autoComplete="off"
                  readOnly
                  value={pendingId.current}
                />

                <label htmlFor="birth-month">Birth month</label>
                <select
                  id="birth-month"
                  name="birth-month"
                  required
                  value={startDraft.birthMonth}
                  onChange={(e) => updateStartDraft("birthMonth", e.target.value)}
                >
                  <option value="">Select month</option>
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>

                <label htmlFor="music-background">Musical background</label>
                <select
                  id="music-background"
                  name="music-background"
                  required
                  value={startDraft.musicBackground}
                  onChange={(e) => updateStartDraft("musicBackground", e.target.value)}
                >
                  <option value="">Select one</option>
                  <option value="1">
                    1 - I do not have musical training and rarely engage with music.
                  </option>
                  <option value="2">
                    2 - I listen to music and know some styles, musicians, and genres, but I
                    have not studied music.
                  </option>
                  <option value="3">
                    3 - I have basic knowledge of playing an instrument or music theory, but
                    no formal training.
                  </option>
                  <option value="4">
                    4 - I have self-taught music theory or an instrument and am at an amateur
                    level.
                  </option>
                  <option value="5">
                    5 - I have received professional training in a systematic manner.
                  </option>
                </select>
              </fieldset>
              <p className="validation-message start-validation" role="status">
                {startValidation}
              </p>
              <button type="submit">Start survey</button>
            </form>
          ) : (
            <div className="resume-panel" aria-live="polite">
              <p className="eyebrow">In progress</p>
              <h2>Continue your survey?</h2>
              <p className="resume-summary">
                {!session.instructionsSeen
                  ? "You have not finished the instructions step yet."
                  : `You left off on question ${session.currentIndex + 1} of ${session.trials.length}.`}
              </p>
              <p className="resume-meta">
                Participant ID: {session.participantId}. Progress is stored only on this
                device (browser storage) until you submit the survey.
              </p>
              <div className="resume-actions">
                <button type="button" onClick={handleResumeContinue}>
                  Continue survey
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleResumeRestart}
                >
                  Start over
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Instructions screen ── */}
      {screen === "instructions" && (
        <section className="instructions-panel">
          <div className="instructions-left">
            <p className="eyebrow">Instructions</p>
            <h2>Listening Test Instructions</h2>
            <p>Thank you for participating in this listening study!</p>

            <h3>What You Will Hear</h3>
            <p>In each question, you will hear <strong>three music clips</strong>:</p>
            <ul className="instruction-list">
              <li><strong>One original clip</strong></li>
              <li><strong>Two edited versions</strong> derived from the same original clip</li>
            </ul>
            <p>All clips are short excerpts and may be replayed as many times as you like.</p>

            <h3>Your Task</h3>
            <p>
              For each question, you will be asked to focus on <strong>one specific musical
              aspect</strong>, such as:
            </p>
            <ul className="instruction-list">
              <li>Harmony</li>
              <li>Rhythm &amp; Meter</li>
              <li>Structural Form</li>
              <li>Melodic Content &amp; Motifs</li>
            </ul>
            <p>
              <strong>
                Your task is to compare the two edited clips and decide which one is farther
                from the original one with respect to that aspect.
              </strong>
            </p>
          </div>

          <div className="instructions-right">
            <h3>How to Answer</h3>
            <p>After listening, select one of the following options:</p>
            <ul className="instruction-list">
              <li>Edited Clip A is farther from the original</li>
              <li>Edited Clip B is farther from the original</li>
              <li>
                The difference is negligible (use this option only if you cannot make a
                decision after careful listening)
              </li>
            </ul>

            <h3>Important Notes</h3>
            <ul className="instruction-list">
              <li>
                Please <strong>focus only on the specified musical aspect</strong> for each
                question. Ignore other differences.
              </li>
              <li>
                You may <strong>listen to each clip multiple times</strong> before making a
                decision.
              </li>
              <li>
                Use <strong>headphones or a quiet environment</strong> if possible for better
                listening quality.
              </li>
              <li>Some differences may be subtle — please rely on your best judgment.</li>
            </ul>

            <button type="button" onClick={handleBeginQuestions}>
              Begin questions
            </button>
          </div>
        </section>
      )}

      {/* ── Questionnaire screen ── */}
      {screen === "questionnaire" && trial && (
        <section className="questionnaire-panel">
          <header className="trial-header">
            <div>
              <p className="eyebrow">
                Section {trial.sectionIndex} of {SECTIONS.length}
              </p>
              <h2>{trial.section.label}</h2>
            </div>
            <div className="trial-header-right">
              <div className="progress-copy">
                Question {session.currentIndex + 1} of {total}
              </div>
              <button
                type="button"
                className="secondary-button instructions-btn"
                onClick={() => setShowInstructionsModal(true)}
              >
                Read instructions
              </button>
            </div>
          </header>

          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>

          <section className="question-copy" aria-label="Question">
            <p className="eyebrow">
              Question {trial.questionNumber} of {trial.questionsInSection}
            </p>
            <p className="prompt-text">{trial.section.prompt}</p>
          </section>

          <form className="response-form" onSubmit={handleNext}>
            <fieldset className="sample-stack" aria-label="Audio samples">
              <legend>Listen to each audio clip as many times as needed</legend>

              <div className="original-sample">
                <span className="sample-name">Original audio</span>
                <audio
                  key={`orig-${trial.id}`}
                  controls
                  preload="metadata"
                  src={trial.audio.original}
                />
              </div>

              <div className="candidate-grid">
                <div className="sample-option">
                  <span className="sample-name">Edited version A</span>
                  <audio
                    key={`${trial.id}-A`}
                    controls
                    preload="metadata"
                    src={trial.audio.clipA}
                  />
                  <label className="choice-row" htmlFor="answer-A">
                    <input
                      type="radio"
                      name="choice"
                      value="A"
                      id="answer-A"
                      checked={choice === "A"}
                      onChange={() => handleChoiceChange("A")}
                    />
                    <span>A is farther from the original</span>
                  </label>
                </div>

                <div className="sample-option">
                  <span className="sample-name">Edited version B</span>
                  <audio
                    key={`${trial.id}-B`}
                    controls
                    preload="metadata"
                    src={trial.audio.clipB}
                  />
                  <label className="choice-row" htmlFor="answer-B">
                    <input
                      type="radio"
                      name="choice"
                      value="B"
                      id="answer-B"
                      checked={choice === "B"}
                      onChange={() => handleChoiceChange("B")}
                    />
                    <span>B is farther from the original</span>
                  </label>
                </div>
              </div>

              <label className="same-option" htmlFor="answer-same">
                <input
                  type="radio"
                  name="choice"
                  value="same"
                  id="answer-same"
                  checked={choice === "same"}
                  onChange={() => handleChoiceChange("same")}
                />
                <span>The difference is negligible</span>
              </label>
            </fieldset>

            <p className="validation-message" role="status">
              {validationMsg}
            </p>

            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={handleBack}
                disabled={session.currentIndex === 0}
              >
                Back
              </button>
              <button type="submit" disabled={isSaving}>
                {session.currentIndex === total - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Section modal ── */}
      {screen === "questionnaire" && showSectionModal && trial && (
        <div
          className="section-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="section-modal-title"
          tabIndex={0}
        >
          <div className="section-modal-panel">
            <div className="section-modal-left">
              <p className="eyebrow">
                Section {trial.sectionIndex} of {SECTIONS.length}
              </p>
              <h2 id="section-modal-title">{trial.section.label}</h2>
              <h3>Definition</h3>
              <p>{trial.section.definition}</p>
              <div className="section-modal-grid">
                <div>
                  <h3>Only Focus on</h3>
                  <ul>
                    {trial.section.focus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    <li>Ignore all other music facets except {trial.section.label}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="section-modal-right">
              <div className="section-example">
                <h3>Example</h3>
                <p>Listen to the example below. The correct answer is revealed afterward.</p>
                <table className="example-table">
                  <thead>
                    <tr>
                      <th>Clip</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trial.section.example.clips.map((row) => (
                      <tr key={row.clip}>
                        <td>{row.clip}</td>
                        <td>{row.edit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="example-audio-stack">
                  <div className="example-audio-row">
                    <span className="example-audio-label">Original</span>
                    <audio controls preload="metadata" src={trial.section.example.audio.original} />
                  </div>
                  <div className="example-audio-row">
                    <span className="example-audio-label">Clip A</span>
                    <audio controls preload="metadata" src={trial.section.example.audio.clipA} />
                  </div>
                  <div className="example-audio-row">
                    <span className="example-audio-label">Clip B</span>
                    <audio controls preload="metadata" src={trial.section.example.audio.clipB} />
                  </div>
                </div>

                <p className="example-answer">
                  <strong>Correct answer:</strong> {trial.section.example.correctAnswer}
                </p>
                <p className="example-explanation">{trial.section.example.explanation}</p>
              </div>
              <button type="button" onClick={handleStartSection}>
                Start section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete screen ── */}
      {screen === "complete" && (
        <section className="complete-panel">
          <p className="eyebrow">Complete</p>
          <h2>Thank you for taking this survey.</h2>
          {saveMessage && <p>{saveMessage}</p>}
          {!contactSaved ? (
            <form className="contact-form" onSubmit={handleContactSubmit}>
              <label htmlFor="contact-info">Email address or Alipay account</label>
              <p>
                Feel free to leave an anonymous email address or Alipay account (e.g., an
                email address without your real name) if you would like to receive a reward.
                Participants whose responses pass our sanity check will receive either a $10
                Amazon gift card or an equivalent Alipay transfer (CNY). Rewards will be
                distributed between April 28 and May 1.
              </p>
              <input
                id="contact-info"
                name="contact-info"
                autoComplete="off"
                placeholder="Optional"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
              <div
                className={`contact-feedback${contactFeedbackVisible ? " is-visible" : ""}`}
                role="status"
              >
                <span className="success-mark" aria-hidden="true">
                  ✓
                </span>
              </div>
              <button type="submit">Save contact information</button>
            </form>
          ) : (
            <p>
              Thank you for sharing your contact information. We will reach out soon.
            </p>
          )}
        </section>
      )}
      {/* ── Instructions modal ── */}
      {showInstructionsModal && trial && (
        <div
          className="section-modal instructions-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="instr-modal-title"
          tabIndex={0}
        >
          <div className="section-modal-panel">
            <div className="section-modal-left">
              <p className="eyebrow">Instructions</p>
              <h2 id="instr-modal-title">Listening Test Instructions</h2>
              <p>Thank you for participating in this listening study!</p>

              <h3>What You Will Hear</h3>
              <p>In each question, you will hear <strong>three music clips</strong>:</p>
              <ul className="instruction-list">
                <li><strong>One original clip</strong></li>
                <li><strong>Two edited versions</strong> derived from the same original clip</li>
              </ul>
              <p>All clips are short excerpts and may be replayed as many times as you like.</p>

              <h3>Your Task</h3>
              <p>
                For each question, you will be asked to focus on <strong>one specific musical
                aspect</strong>, such as:
              </p>
              <ul className="instruction-list">
                <li>Harmony</li>
                <li>Rhythm &amp; Meter</li>
                <li>Structural Form</li>
                <li>Melodic Content &amp; Motifs</li>
              </ul>
              <p>
                <strong>
                  Your task is to compare the two edited clips and decide which one is farther
                  from the original one with respect to that aspect.
                </strong>
              </p>

              <h3>How to Answer</h3>
              <p>After listening, select one of the following options:</p>
              <ul className="instruction-list">
                <li>Edited Clip A is farther from the original</li>
                <li>Edited Clip B is farther from the original</li>
                <li>
                  The difference is negligible (use this option only if you cannot make a
                  decision after careful listening)
                </li>
              </ul>

              <h3>Important Notes</h3>
              <ul className="instruction-list">
                <li>
                  Please <strong>focus only on the specified musical aspect</strong> for each
                  question. Ignore other differences.
                </li>
                <li>
                  You may <strong>listen to each clip multiple times</strong> before making a
                  decision.
                </li>
                <li>
                  Use <strong>headphones or a quiet environment</strong> if possible for better
                  listening quality.
                </li>
                <li>Some differences may be subtle — please rely on your best judgment.</li>
              </ul>
            </div>
            <div className="section-modal-right">
              <p className="eyebrow">
                Section {trial.sectionIndex} of {SECTIONS.length}
              </p>
              <h2>{trial.section.label}</h2>
              <h3>Definition</h3>
              <p>{trial.section.definition}</p>
              <div className="section-modal-grid">
                <div>
                  <h3>Only Focus on</h3>
                  <ul>
                    {trial.section.focus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    <li>Ignore all other music facets except {trial.section.label}</li>
                  </ul>
                </div>
              </div>

              <div className="section-example">
                <h3>Example ({trial.section.label})</h3>
                <p>Listen to the example below. The correct answer is revealed afterward.</p>
                <table className="example-table">
                  <thead>
                    <tr>
                      <th>Clip</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trial.section.example.clips.map((row) => (
                      <tr key={row.clip}>
                        <td>{row.clip}</td>
                        <td>{row.edit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="example-audio-stack">
                  <div className="example-audio-row">
                    <span className="example-audio-label">Original</span>
                    <audio controls preload="metadata" src={trial.section.example.audio.original} />
                  </div>
                  <div className="example-audio-row">
                    <span className="example-audio-label">Clip A</span>
                    <audio controls preload="metadata" src={trial.section.example.audio.clipA} />
                  </div>
                  <div className="example-audio-row">
                    <span className="example-audio-label">Clip B</span>
                    <audio controls preload="metadata" src={trial.section.example.audio.clipB} />
                  </div>
                </div>

                <p className="example-answer">
                  <strong>Correct answer:</strong> {trial.section.example.correctAnswer}
                </p>
                <p className="example-explanation">{trial.section.example.explanation}</p>
              </div>
              <button type="button" onClick={() => setShowInstructionsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
