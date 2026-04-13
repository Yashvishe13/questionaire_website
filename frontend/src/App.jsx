import { useState, useEffect, useRef } from "react";
import {
  SECTIONS,
  EDITING_INSTRUCTIONS,
  INSTRUCTION_AUDIO_MAP,
  SPLITS,
  STORAGE_KEY,
  COMPLETED_KEY,
  PENDING_PARTICIPANT_KEY,
  START_DRAFT_KEY,
} from "./constants";

// ── Utilities ────────────────────────────────────────────────────────────────

function getSplitIndex(birthMonth) {
  const m = parseInt(birthMonth, 10);
  return Math.floor(((m - 1) * 5) / 12);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedSource) {
  let seed = hashString(seedSource);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
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

function musicUrl(...segments) {
  return `/music/${segments.join("/")}`;
}

function buildTrials(sampleSeed, birthMonth) {
  const splitIndex = getSplitIndex(birthMonth);
  const split = SPLITS[splitIndex];
  const splitSampleIds = Array.from({ length: split.count }, (_, i) => split.start + i);
  const totalQuestions = split.questionsPerSection.reduce((a, b) => a + b, 0);

  const random = createSeededRandom(sampleSeed);

  const baseIds = [];
  while (baseIds.length < totalQuestions) {
    baseIds.push(...shuffle([...splitSampleIds], random));
  }
  const baseIdSeq = baseIds.slice(0, totalQuestions);

  const sourceIds = EDITING_INSTRUCTIONS.filter(
    (instr) => INSTRUCTION_AUDIO_MAP[instr.id],
  ).map((instr) => instr.id);
  const instructionIds = [];
  while (instructionIds.length < totalQuestions) {
    instructionIds.push(...shuffle([...sourceIds], random));
  }
  const instrIdSeq = instructionIds.slice(0, totalQuestions);

  const trials = [];
  SECTIONS.forEach((section, sectionIndex) => {
    const qCount = split.questionsPerSection[sectionIndex];
    for (let qNum = 1; qNum <= qCount; qNum++) {
      const baseId = baseIdSeq.shift();
      const instructionId = instrIdSeq.shift();
      const instruction = EDITING_INSTRUCTIONS.find((i) => i.id === instructionId);
      const dirs = INSTRUCTION_AUDIO_MAP[instructionId];
      const stem = `sample_${baseId}`;
      trials.push({
        id: `${section.id}-q${qNum}`,
        section,
        sectionIndex: sectionIndex + 1,
        questionNumber: qNum,
        questionsInSection: qCount,
        instruction,
        baseId,
        original: {
          role: "original",
          fileId: stem,
          baseId,
          src: musicUrl("lmd_100_samples_wav", `${stem}.wav`),
        },
        candidates: [
          {
            role: "candidate",
            engine: "librosa",
            engineLabel: "Librosa",
            blindSide: "A",
            position: "left",
            fileId: `${stem}-librosa-${instructionId}`,
            baseId,
            instructionId,
            src: musicUrl(dirs.librosaDir, `${stem}.wav`),
          },
          {
            role: "candidate",
            engine: "midi",
            engineLabel: "MIDI",
            blindSide: "B",
            position: "right",
            fileId: `${stem}-midi-${instructionId}`,
            baseId,
            instructionId,
            src: musicUrl(dirs.midiDir, `${stem}.wav`),
          },
        ],
      });
    }
  });
  return trials;
}

function createSession(participantId, birthMonth, musicBackground) {
  const sampleSeed = `${participantId}:${birthMonth}`;
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
    sampleSeed,
    sessionId: createId("session"),
    startedAt: new Date().toISOString(),
    submittedAt: null,
    instructionsSeen: false,
    seenSectionIds: [],
    currentIndex: 0,
    splitIndex: getSplitIndex(birthMonth),
    trials: buildTrials(sampleSeed, birthMonth),
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
    sampleSeed: sess.sampleSeed,
    sessionId: sess.sessionId,
    startedAt: sess.startedAt,
    submittedAt: sess.submittedAt,
    responseCount: Object.keys(sess.responses).length,
    sectionCount: SECTIONS.length,
    splitIndex: sess.splitIndex,
    questionsPerSection: SPLITS[sess.splitIndex].questionsPerSection,
    audioSampleCount: sess.trials.length * 3,
    trials: sess.trials.map((trial, i) => ({
      index: i + 1,
      trialId: trial.id,
      section: trial.section,
      questionNumber: trial.questionNumber,
      instruction: trial.instruction,
      baseId: trial.baseId,
      original: trial.original,
      candidates: trial.candidates,
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
  const dc = existing.displayChoice;
  if (dc === "A" || dc === "B" || dc === "same") return dc;
  const pref = existing.preference || existing.selectedSide;
  if (pref === "same") return "same";
  if (pref === "librosa" || pref === "midi") {
    const c = trial.candidates.find((x) => x.engine === pref);
    return c ? c.blindSide : "";
  }
  if (pref === "A" || pref === "B") return pref;
  return "";
}

function applyResponse(sess, choiceVal) {
  if (!choiceVal) return null;
  const trial = sess.trials[sess.currentIndex];
  let preference;
  let selectedSample = null;
  if (choiceVal === "same") {
    preference = "same";
  } else {
    selectedSample = trial.candidates.find((c) => c.blindSide === choiceVal);
    preference = selectedSample ? selectedSample.engine : null;
  }
  return {
    ...sess,
    responses: {
      ...sess.responses,
      [trial.id]: {
        trialId: trial.id,
        sectionId: trial.section.id,
        sectionLabel: trial.section.label,
        questionNumber: trial.questionNumber,
        instructionId: trial.instruction.id,
        editingInstruction: trial.instruction.text,
        baseId: trial.baseId,
        displayChoice: choiceVal,
        preference,
        chosenEngine: selectedSample ? selectedSample.engine : null,
        chosenEngineLabel: selectedSample ? selectedSample.engineLabel : null,
        selectedSample,
        original: trial.original,
        candidates: trial.candidates,
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
  const [contactInfo, setContactInfo] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [contactFeedbackVisible, setContactFeedbackVisible] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [startDraft, setStartDraft] = useState({ birthMonth: "", musicBackground: "" });

  const syncTimer = useRef(null);
  const pendingId = useRef(getPendingParticipantId());

  // Load persisted session on mount
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

  // Flush in-progress answer on page unload
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

  function canSync(sess) {
    return Boolean(sess && !sess.submittedAt && sess.sessionId && sess.participantId);
  }

  function queueSync(sess, immediate) {
    if (!canSync(sess)) {
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
    setShowSectionModal(!seen.includes(trial.section.id));
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
  }

  function handleChoiceChange(val) {
    setChoice(val);
    setValidationMsg("");
    const updated = applyResponse(session, val);
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
    let updated = applyResponse(session, choice);
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

    // Last question — finish
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
      updated = applyResponse(session, choice) || session;
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
            <p className="thank-you-note">Thank you for taking this survey.</p>
            <h1>Evaluate which edit preserves the original music better.</h1>
            <p>Your responses will help us compare music editing methods.</p>
            <p>
              You will complete 4 sections of questions. Each question includes an original
              clip, an editing instruction, and two edited versions.
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
          <p className="eyebrow">Instructions</p>
          <h2>Before you begin</h2>
          <h3>Important guidelines</h3>
          <ul className="instruction-list">
            <li>
              Listen to the original clip, then edited option A and edited option B (order is
              fixed for each question).
            </li>
            <li>Use the editing instruction as context only.</li>
            <li>Focus only on the specified musical aspect.</li>
            <li>Ignore whether the intended edit itself is correct.</li>
            <li>Choose the version with fewer unintended changes.</li>
            <li>
              Do not judge by personal preference, audio quality, loudness, or which version
              sounds more interesting.
            </li>
            <li>You may listen to each clip multiple times.</li>
          </ul>
          <button type="button" onClick={handleBeginQuestions}>
            Begin questions
          </button>
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
            <div className="progress-copy">
              Question {session.currentIndex + 1} of {total}
            </div>
          </header>

          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>

          <section className="question-copy" aria-label="Question">
            <p className="eyebrow">
              Question {trial.questionNumber} of {trial.questionsInSection}
            </p>
            <p className="instruction-row">
              <span>Editing instruction: </span>
              <strong>{trial.instruction.text}</strong>
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
                  src={trial.original.src}
                />
              </div>

              <div className="candidate-grid">
                {trial.candidates.map((candidate) => (
                  <div key={candidate.blindSide} className="sample-option">
                    <span className="sample-name">
                      Edited version {candidate.blindSide}
                    </span>
                    <audio
                      key={`${trial.id}-${candidate.blindSide}`}
                      controls
                      preload="metadata"
                      src={candidate.src}
                    />
                    <label
                      className="choice-row"
                      htmlFor={`answer-${candidate.blindSide}`}
                    >
                      <input
                        type="radio"
                        name="choice"
                        value={candidate.blindSide}
                        id={`answer-${candidate.blindSide}`}
                        checked={choice === candidate.blindSide}
                        onChange={() => handleChoiceChange(candidate.blindSide)}
                      />
                      <span>{candidate.blindSide} is better</span>
                    </label>
                  </div>
                ))}
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
                <span>About the same</span>
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
            <p className="eyebrow">
              Section {trial.sectionIndex} of {SECTIONS.length}
            </p>
            <h2 id="section-modal-title">{trial.section.label}</h2>
            <h3>Definition</h3>
            <p>{trial.section.definition}</p>
            <div className="section-modal-grid">
              <div>
                <h3>Focus on</h3>
                <ul>
                  {trial.section.focus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Ignore</h3>
                <ul>
                  {trial.section.ignore.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button type="button" onClick={handleStartSection}>
              Start section
            </button>
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
                This is entirely voluntary. As a token of appreciation, we will provide a
                $10 Amazon gift card to participants who choose to share their contact
                information.
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
    </main>
  );
}
