"use strict";

/**
 * Root for all clips (WAV). Set before this script loads if needed, e.g.
 * ``window.MUSIC_BASE = "/my-site/music"`` (no trailing slash).
 */
const MUSIC_BASE = (() => {
  const raw =
    typeof window !== "undefined" && window.MUSIC_BASE != null
      ? String(window.MUSIC_BASE)
      : "./music";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed === "" ? "." : trimmed;
})();

function musicUrl(...segments) {
  return `${MUSIC_BASE}/${segments.join("/")}`;
}

// In-browser session: progress, answers, trials (localStorage). Server (Supabase) only
// receives data when the participant finishes or saves optional contact info, unless you add sync.
const STORAGE_KEY = "musicQuestionnaireSession.v9";
const COMPLETED_KEY = "musicQuestionnaireCompleted.v9";
const PENDING_PARTICIPANT_KEY = "musicQuestionnairePendingParticipantId.v1";
const START_DRAFT_KEY = "musicQuestionnaireStartDraft.v1";
const API_URL = (window.QUESTIONNAIRE_API_URL || "").replace(/\/$/, "");

const SECTIONS = [
  {
    id: "harmony",
    label: "Harmony",
    definition:
      "Harmony refers to chord progression, tonal consistency, and harmonic color.",
    focus: ["chord progression", "tonal center", "harmonic continuity"],
    ignore: ["rhythm or tempo", "instrumentation", "minor audio differences"],
    prompt:
      "Which version better preserves the harmony of the original music, aside from the intended edit?",
  },
  {
    id: "rhythm_meter",
    label: "Rhythm & Meter",
    definition:
      "Rhythm and meter refer to beat alignment, tempo, and rhythmic patterns.",
    focus: ["beat timing", "tempo consistency", "rhythmic structure"],
    ignore: ["pitch or harmony", "timbre", "instrumentation"],
    prompt:
      "Which version better preserves the rhythm and meter of the original music, aside from the intended edit?",
  },
  {
    id: "structural_form",
    label: "Structural Form",
    definition:
      "Structural form refers to the large-scale organization of music, including sections and repetition patterns.",
    focus: [
      "section boundaries, such as intro, verse, chorus",
      "repetition structure",
      "overall organization",
    ],
    ignore: ["small note-level changes", "local timing variations", "timbre"],
    prompt:
      "Which version better preserves the structural form of the original music, aside from the intended edit?",
  },
  {
    id: "melodic_content_motifs",
    label: "Melodic Content & Motifs",
    definition:
      "Melodic content refers to pitch sequences and contour, while motifs are recurring melodic patterns.",
    focus: [
      "melodic contour, up and down movement",
      "recognizable phrases",
      "recurring motifs",
    ],
    ignore: ["pitch shift or transposition", "tempo changes", "instrumentation"],
    prompt:
      "Which version better preserves the melodic content and motifs of the original music, aside from the intended edit?",
  },
];

const EDITING_INSTRUCTIONS = [
  {
    id: "global_pitch_shift",
    text: "Shift the pitch of the music up by 6 semitones.",
  },
  {
    id: "global_time_stretch",
    text: "Stretch the timing of the music by 1.5x.",
  },
  {
    id: "segment_shuffle",
    text: "Cyclically rotate 4 equal music segments.",
  },
  {
    id: "vocal_only_pitch_shift",
    text: "Shift only the vocal pitch up by 5 semitones.",
  },
];

/** Sample indices 0–97 → ``lmd_100_samples_wav/sample_{n}.wav`` under ``MUSIC_BASE`` */
const TOTAL_SAMPLES = 98;

/**
 * 5 splits of 98 samples (20+20+20+20+18), assigned by birth month.
 * Each split has 4 sections; questions per section are [5,5,5,5] except
 * the last split which is [5,5,5,3].
 */
const SPLITS = [
  { start: 0,  count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 20, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 40, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 60, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 80, count: 18, questionsPerSection: [5, 5, 5, 3] },
];

/** Map birth month (01–12) to split index (0–4). */
function getSplitIndex(birthMonth) {
  const m = parseInt(birthMonth, 10);
  return Math.floor((m - 1) * 5 / 12);
}

/**
 * Per editing instruction, which folders under ``MUSIC_BASE`` hold the two renders.
 * Left column is always blind ``A`` (Librosa in data); right is ``B`` (MIDI in data).
 * UI never labels engines; ``preference`` in saved responses is ``librosa`` | ``midi`` | ``same``.
 */
const INSTRUCTION_AUDIO_MAP = {
  global_pitch_shift: {
    librosaDir: "librosa_pitch_shift",
    midiDir: "midi_pitch_shift",
  },
  global_time_stretch: {
    librosaDir: "librosa_time_stretch",
    midiDir: "midi_time_stretch",
  },
  segment_shuffle: {
    librosaDir: "librosa_segment_shuffle",
    midiDir: "midi_segment_shuffle",
  },
  vocal_only_pitch_shift: {
    librosaDir: "librosa_vocal_pitch_shift",
    midiDir: "midi_vocal_shift",
  },
};

const elements = {
  startScreen: document.querySelector("#start-screen"),
  instructionsScreen: document.querySelector("#instructions-screen"),
  questionnaireScreen: document.querySelector("#questionnaire-screen"),
  completeScreen: document.querySelector("#complete-screen"),
  startForm: document.querySelector("#start-form"),
  participantId: document.querySelector("#participant-id"),
  birthMonth: document.querySelector("#birth-month"),
  musicBackground: document.querySelector("#music-background"),
  startValidationMessage: document.querySelector("#start-validation-message"),
  sectionLabel: document.querySelector("#section-label"),
  sectionHeading: document.querySelector("#section-heading"),
  progressLabel: document.querySelector("#progress-label"),
  progressBar: document.querySelector("#progress-bar"),
  questionLabel: document.querySelector("#question-label"),
  editingInstruction: document.querySelector("#editing-instruction"),
  promptText: document.querySelector("#prompt-text"),
  responseForm: document.querySelector("#response-form"),
  audioOriginal: document.querySelector("#audio-original"),
  audioA: document.querySelector("#audio-a"),
  audioB: document.querySelector("#audio-b"),
  validationMessage: document.querySelector("#validation-message"),
  backButton: document.querySelector("#back-button"),
  nextButton: document.querySelector("#next-button"),
  beginQuestionsButton: document.querySelector("#begin-questions-button"),
  sectionModal: document.querySelector("#section-modal"),
  sectionModalLabel: document.querySelector("#section-modal-label"),
  sectionModalTitle: document.querySelector("#section-modal-title"),
  sectionModalDefinition: document.querySelector("#section-modal-definition"),
  sectionModalFocus: document.querySelector("#section-modal-focus"),
  sectionModalIgnore: document.querySelector("#section-modal-ignore"),
  startSectionButton: document.querySelector("#start-section-button"),
  saveMessage: document.querySelector("#save-message"),
  contactForm: document.querySelector("#contact-form"),
  contactInfo: document.querySelector("#contact-info"),
  contactSubmitButton: document.querySelector("#contact-submit-button"),
  contactFeedback: document.querySelector("#contact-feedback"),
  contactStatus: document.querySelector("#contact-status"),
  resumePanel: document.querySelector("#resume-panel"),
  resumeSummary: document.querySelector("#resume-summary"),
  resumeMeta: document.querySelector("#resume-meta"),
  resumeContinueButton: document.querySelector("#resume-continue-button"),
};

let state = loadSession();
let progressSyncTimer = null;

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

function buildTrials(seedSource, birthMonth) {
  const splitIndex = getSplitIndex(birthMonth);
  const split = SPLITS[splitIndex];
  const splitSampleIds = Array.from(
    { length: split.count },
    (_, i) => split.start + i,
  );
  const totalQuestions = split.questionsPerSection.reduce((a, b) => a + b, 0);

  const random = createSeededRandom(seedSource);
  const baseIds = buildBaseIdSequence(totalQuestions, random, splitSampleIds);
  const instructionIds = buildInstructionIdSequence(totalQuestions, random);
  const trials = [];

  SECTIONS.forEach((section, sectionIndex) => {
    const qCount = split.questionsPerSection[sectionIndex];
    for (let questionNumber = 1; questionNumber <= qCount; questionNumber += 1) {
      const baseId = baseIds.shift();
      const instructionId = instructionIds.shift();
      const instruction = EDITING_INSTRUCTIONS.find(
        (item) => item.id === instructionId,
      );
      const dirs = INSTRUCTION_AUDIO_MAP[instructionId];
      const candidates = buildCandidatePair(baseId, instruction, dirs);

      trials.push({
        id: `${section.id}-q${questionNumber}`,
        section,
        sectionIndex: sectionIndex + 1,
        questionNumber,
        questionsInSection: qCount,
        instruction,
        baseId,
        original: toOriginalSample(baseId),
        candidates,
      });
    }
  });

  return trials;
}

function buildBaseIdSequence(requiredCount, random, samplePool) {
  const baseIds = [];

  while (baseIds.length < requiredCount) {
    baseIds.push(...shuffle([...samplePool], random));
  }

  return baseIds.slice(0, requiredCount);
}

function buildInstructionIdSequence(requiredCount, random) {
  const instructionIds = [];
  const sourceIds = EDITING_INSTRUCTIONS.filter(
    (instruction) => INSTRUCTION_AUDIO_MAP[instruction.id],
  ).map((instruction) => instruction.id);

  while (instructionIds.length < requiredCount) {
    instructionIds.push(...shuffle([...sourceIds], random));
  }

  return instructionIds.slice(0, requiredCount);
}

function toOriginalSample(baseId) {
  const stem = `sample_${baseId}`;
  return {
    role: "original",
    fileId: stem,
    baseId,
    src: musicUrl("lmd_100_samples_wav", `${stem}.wav`),
  };
}

/** Left = Option A (Librosa); right = Option B (MIDI). ``blindSide`` is all the UI reveals. */
function buildCandidatePair(baseId, instruction, dirs) {
  const stem = `sample_${baseId}`;
  return [
    {
      role: "candidate",
      engine: "librosa",
      engineLabel: "Librosa",
      blindSide: "A",
      position: "left",
      fileId: `${stem}-librosa-${instruction.id}`,
      baseId,
      instructionId: instruction.id,
      src: musicUrl(dirs.librosaDir, `${stem}.wav`),
    },
    {
      role: "candidate",
      engine: "midi",
      engineLabel: "MIDI",
      blindSide: "B",
      position: "right",
      fileId: `${stem}-midi-${instruction.id}`,
      baseId,
      instructionId: instruction.id,
      src: musicUrl(dirs.midiDir, `${stem}.wav`),
    },
  ];
}

function render() {
  if (!state) {
    showScreen("start");
    setStartColumnMode("form");
    elements.participantId.value = getPendingParticipantId();
    elements.birthMonth.value = "";
    elements.musicBackground.value = "";
    applyStartDraft();
    elements.startValidationMessage.textContent = "";
    return;
  }

  if (state.submittedAt) {
    showCompleteScreen();
    return;
  }

  showScreen("start");
  setStartColumnMode("resume");
  populateResumePanel();
}

function setStartColumnMode(mode) {
  if (mode === "resume") {
    elements.startForm.classList.add("is-hidden");
    elements.resumePanel.classList.remove("is-hidden");
  } else {
    elements.startForm.classList.remove("is-hidden");
    elements.resumePanel.classList.add("is-hidden");
  }
}

function populateResumePanel() {
  const total = state.trials.length;
  const answered = Object.keys(state.responses).length;
  let headline;
  let detail;

  if (!state.instructionsSeen) {
    headline = "You have not finished the instructions step yet.";
    detail = "Your demographics are saved. You can continue from there.";
  } else {
    headline = `You left off on question ${state.currentIndex + 1} of ${total}.`;
    detail = `${answered} of ${total} questions have an answer saved in this browser.`;
  }

  elements.resumeSummary.textContent = headline;
  elements.resumeMeta.textContent = `Participant ID: ${state.participantId}. Progress is stored only on this device (browser storage) until you submit the survey.`;
}

function continueSurvey() {
  if (!state || state.submittedAt) {
    return;
  }

  if (!state.instructionsSeen) {
    showScreen("instructions");
    return;
  }

  showScreen("questionnaire");
  renderTrial();
}

function discardSurveyProgress() {
  clearProgressSyncTimer();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(COMPLETED_KEY);
  localStorage.removeItem(START_DRAFT_KEY);
  localStorage.removeItem(PENDING_PARTICIPANT_KEY);
  state = null;
  elements.sectionModal?.classList.add("is-hidden");
  clearChoice();
  render();
}

function applyStartDraft() {
  const raw = localStorage.getItem(START_DRAFT_KEY);

  if (!raw) {
    return;
  }

  try {
    const draft = JSON.parse(raw);

    if (draft.birthMonth) {
      elements.birthMonth.value = draft.birthMonth;
    }

    if (draft.musicBackground) {
      elements.musicBackground.value = draft.musicBackground;
    }
  } catch {
    localStorage.removeItem(START_DRAFT_KEY);
  }
}

function persistStartDraft() {
  if (state) {
    return;
  }

  const birthMonth = elements.birthMonth.value;
  const musicBackground = elements.musicBackground.value;

  if (!birthMonth && !musicBackground) {
    localStorage.removeItem(START_DRAFT_KEY);
    return;
  }

  localStorage.setItem(
    START_DRAFT_KEY,
    JSON.stringify({ birthMonth, musicBackground }),
  );
}

function clearStartDraft() {
  localStorage.removeItem(START_DRAFT_KEY);
}

function flushInProgressAnswer() {
  if (!state || state.submittedAt) {
    return;
  }

  if (elements.questionnaireScreen.classList.contains("is-hidden")) {
    return;
  }

  if (new FormData(elements.responseForm).get("choice")) {
    saveCurrentResponse();
    clearProgressSyncTimer();
    void syncProgressToServer();
  }
}

function clearProgressSyncTimer() {
  if (progressSyncTimer !== null) {
    window.clearTimeout(progressSyncTimer);
    progressSyncTimer = null;
  }
}

function canSyncProgressToServer() {
  return Boolean(
    API_URL && state && !state.submittedAt && state.sessionId && state.participantId,
  );
}

async function syncProgressToServer() {
  if (!canSyncProgressToServer()) {
    return;
  }

  const payload = buildSubmissionPayload();

  try {
    const response = await fetch(`${API_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn("Incremental progress sync failed:", response.status);
    }
  } catch (error) {
    console.warn("Incremental progress sync error:", error);
  }
}

function queueProgressSync(immediate) {
  if (!canSyncProgressToServer()) {
    clearProgressSyncTimer();
    return;
  }

  const run = () => {
    progressSyncTimer = null;
    void syncProgressToServer();
  };

  if (immediate) {
    clearProgressSyncTimer();
    run();
    return;
  }

  clearProgressSyncTimer();
  progressSyncTimer = window.setTimeout(run, 550);
}

async function flushProgressSyncToServer() {
  clearProgressSyncTimer();
  await syncProgressToServer();
}

function renderTrial() {
  const trial = state.trials[state.currentIndex];
  const total = state.trials.length;
  const progress = ((state.currentIndex + 1) / total) * 100;
  const existingResponse = state.responses[trial.id];

  elements.sectionLabel.textContent = `Section ${trial.sectionIndex} of ${SECTIONS.length}`;
  elements.sectionHeading.textContent = trial.section.label;
  elements.progressLabel.textContent = `Question ${state.currentIndex + 1} of ${total}`;
  elements.progressBar.style.width = `${progress}%`;
  elements.questionLabel.textContent = `Question ${trial.questionNumber} of ${trial.questionsInSection}`;
  elements.editingInstruction.textContent = trial.instruction.text;
  elements.promptText.textContent = trial.section.prompt;
  elements.audioOriginal.src = trial.original.src;
  elements.audioA.src = trial.candidates.find((s) => s.engine === "librosa").src;
  elements.audioB.src = trial.candidates.find((s) => s.engine === "midi").src;
  elements.audioOriginal.load();
  elements.audioA.load();
  elements.audioB.load();
  elements.backButton.disabled = state.currentIndex === 0;
  elements.nextButton.textContent =
    state.currentIndex === total - 1 ? "Finish" : "Next";
  elements.validationMessage.textContent = "";

  clearChoice();

  if (existingResponse) {
    const radioValue = blindChoiceForRestore(existingResponse, trial);
    const checked = document.querySelector(
      `input[name="choice"][value="${radioValue}"]`,
    );

    if (checked) {
      checked.checked = true;
    }
  }

  renderSectionModal(trial);
}

function renderSectionModal(trial) {
  state.seenSectionIds = state.seenSectionIds || [];

  if (state.seenSectionIds.includes(trial.section.id)) {
    elements.sectionModal.classList.add("is-hidden");
    return;
  }

  elements.sectionModalLabel.textContent = `Section ${trial.sectionIndex} of ${SECTIONS.length}`;
  elements.sectionModalTitle.textContent = trial.section.label;
  elements.sectionModalDefinition.textContent = trial.section.definition;
  renderList(elements.sectionModalFocus, trial.section.focus);
  renderList(elements.sectionModalIgnore, trial.section.ignore);
  elements.sectionModal.classList.remove("is-hidden");
  elements.startSectionButton.focus();
}

function renderList(listElement, items) {
  listElement.replaceChildren(
    ...items.map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    }),
  );
}

function showCompleteScreen() {
  showScreen("complete");
  elements.saveMessage.textContent = "";
  elements.contactInfo.value = state.contactInfo || "";
  updateContactFeedback(Boolean(state.contactInfo));
}

function showScreen(screen) {
  elements.startScreen.classList.toggle("is-hidden", screen !== "start");
  elements.instructionsScreen.classList.toggle(
    "is-hidden",
    screen !== "instructions",
  );
  elements.questionnaireScreen.classList.toggle(
    "is-hidden",
    screen !== "questionnaire",
  );
  elements.completeScreen.classList.toggle("is-hidden", screen !== "complete");
}

/** Map saved response + trial to radio value ``A`` | ``B`` | ``same``. */
function blindChoiceForRestore(existingResponse, trial) {
  const dc = existingResponse.displayChoice;
  if (dc === "A" || dc === "B" || dc === "same") {
    return dc;
  }
  const pref = existingResponse.preference || existingResponse.selectedSide;
  if (pref === "same") {
    return "same";
  }
  if (pref === "librosa" || pref === "midi") {
    const c = trial.candidates.find((x) => x.engine === pref);
    return c ? c.blindSide : "";
  }
  if (pref === "A" || pref === "B") {
    return pref;
  }
  return "";
}

function saveCurrentResponse() {
  const formData = new FormData(elements.responseForm);
  const choice = formData.get("choice");

  if (!choice) {
    elements.validationMessage.textContent = "Choose an answer before continuing.";
    return false;
  }

  const trial = state.trials[state.currentIndex];
  const displayChoice = choice;
  let preference;
  let selectedSample = null;
  if (choice === "same") {
    preference = "same";
  } else {
    selectedSample = trial.candidates.find((c) => c.blindSide === choice);
    preference = selectedSample ? selectedSample.engine : null;
  }

  state.responses[trial.id] = {
    trialId: trial.id,
    sectionId: trial.section.id,
    sectionLabel: trial.section.label,
    questionNumber: trial.questionNumber,
    instructionId: trial.instruction.id,
    editingInstruction: trial.instruction.text,
    baseId: trial.baseId,
    /** What the participant saw: ``A`` | ``B`` | ``same``. */
    displayChoice,
    /** Backend / analysis: ``librosa`` | ``midi`` | ``same`` (never shown in UI). */
    preference,
    chosenEngine: selectedSample ? selectedSample.engine : null,
    chosenEngineLabel: selectedSample ? selectedSample.engineLabel : null,
    selectedSample,
    original: trial.original,
    candidates: trial.candidates,
    answeredAt: new Date().toISOString(),
  };

  persistSession();
  elements.validationMessage.textContent = "";
  return true;
}

async function finishSession() {
  clearProgressSyncTimer();
  state.submittedAt = new Date().toISOString();
  persistSession();

  const payload = buildSubmissionPayload();

  if (API_URL) {
    await submitToApi(payload);
  } else {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(payload));
  }

  clearStartDraft();
  showCompleteScreen();
}

function buildSubmissionPayload() {
  return {
    participantId: state.participantId,
    birthMonth: state.birthMonth,
    demographics: state.demographics || {
      birthMonth: state.birthMonth,
      musicBackground: null,
    },
    contactInfo: state.contactInfo || null,
    contactSubmittedAt: state.contactSubmittedAt || null,
    sampleSeed: state.sampleSeed,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    submittedAt: state.submittedAt,
    responseCount: Object.keys(state.responses).length,
    sectionCount: SECTIONS.length,
    splitIndex: state.splitIndex,
    questionsPerSection: SPLITS[state.splitIndex].questionsPerSection,
    audioSampleCount: state.trials.length * 3,
    trials: state.trials.map((trial, index) => ({
      index: index + 1,
      trialId: trial.id,
      section: trial.section,
      questionNumber: trial.questionNumber,
      instruction: trial.instruction,
      baseId: trial.baseId,
      original: trial.original,
      candidates: trial.candidates,
      response: state.responses[trial.id] || null,
    })),
  };
}

async function submitToApi(payload) {
  const response = await fetch(`${API_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(payload));
    throw new Error(`Submission failed with ${response.status}`);
  }
}

function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearChoice() {
  document.querySelectorAll('input[name="choice"]').forEach((input) => {
    input.checked = false;
  });
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

  if (existing) {
    return existing;
  }

  const nextId = createId("P");
  localStorage.setItem(PENDING_PARTICIPANT_KEY, nextId);
  return nextId;
}

function createSeededRandom(seedSource) {
  let seed = hashString(seedSource);

  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function shuffle(items, random = Math.random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

elements.startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const participantId =
    elements.participantId.value.trim() || getPendingParticipantId();
  const birthMonth = elements.birthMonth.value;
  const musicBackground = {
    value: elements.musicBackground.value,
    label: getSelectedOptionText(elements.musicBackground),
  };

  if (!birthMonth) {
    elements.startValidationMessage.textContent =
      "Choose a birth month before starting.";
    elements.birthMonth.focus();
    return;
  }

  if (!musicBackground.value) {
    elements.startValidationMessage.textContent =
      "Choose a musical background before starting.";
    elements.musicBackground.focus();
    return;
  }

  state = createSession(participantId, birthMonth, musicBackground);
  clearStartDraft();
  persistSession();
  showScreen("instructions");
});

elements.beginQuestionsButton.addEventListener("click", () => {
  if (!state) {
    return;
  }

  state.instructionsSeen = true;
  persistSession();
  showScreen("questionnaire");
  renderTrial();
});

elements.startSectionButton.addEventListener("click", () => {
  if (!state) {
    return;
  }

  const trial = state.trials[state.currentIndex];
  state.seenSectionIds = state.seenSectionIds || [];

  if (!state.seenSectionIds.includes(trial.section.id)) {
    state.seenSectionIds.push(trial.section.id);
  }

  persistSession();
  elements.sectionModal.classList.add("is-hidden");
});

elements.responseForm.addEventListener("change", (event) => {
  const target = event.target;

  if (!target || target.name !== "choice") {
    return;
  }

  if (!state || state.submittedAt) {
    return;
  }

  if (elements.questionnaireScreen.classList.contains("is-hidden")) {
    return;
  }

  if (!saveCurrentResponse()) {
    return;
  }

  queueProgressSync(false);
});

elements.responseForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!saveCurrentResponse()) {
    return;
  }

  queueProgressSync(true);

  if (state.currentIndex < state.trials.length - 1) {
    state.currentIndex += 1;
    persistSession();
    renderTrial();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  elements.nextButton.disabled = true;

  try {
    await flushProgressSyncToServer();
    await finishSession();
  } catch (error) {
    elements.nextButton.disabled = false;
    showCompleteScreen();
    elements.saveMessage.textContent =
      "The server did not accept the submission. A local JSON copy was saved in this browser.";
    console.error(error);
  }
});

elements.backButton.addEventListener("click", () => {
  if (state.currentIndex === 0) {
    return;
  }

  if (new FormData(elements.responseForm).get("choice")) {
    saveCurrentResponse();
    queueProgressSync(true);
  }

  state.currentIndex -= 1;
  persistSession();
  renderTrial();
});

elements.contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state) {
    return;
  }

  state.contactInfo = elements.contactInfo.value.trim() || null;
  state.contactSubmittedAt = new Date().toISOString();
  persistSession();
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(buildSubmissionPayload()));
  elements.contactSubmitButton.disabled = true;
  elements.contactSubmitButton.textContent = "Saving...";

  if (!state.contactInfo) {
    updateContactFeedback(false);
    elements.contactSubmitButton.disabled = false;
    elements.contactSubmitButton.textContent = "Save contact information";
    return;
  }

  if (!API_URL) {
    showContactSaved();
    return;
  }

  try {
    await submitToApi(buildSubmissionPayload());
    showContactSaved();
  } catch (error) {
    showContactSaved();
    console.error(error);
  }
});

function showContactSaved() {
  elements.contactForm.classList.add("is-hidden");
  elements.saveMessage.textContent =
    "Thank you for sharing your contact information. We will reach out soon.";
}

function updateContactFeedback(isVisible) {
  elements.contactStatus.textContent = "";
  elements.contactFeedback.classList.toggle("is-visible", isVisible);
}

function getSelectedOptionText(select) {
  const selectedOption = select.selectedOptions[0];

  if (!selectedOption) {
    return "";
  }

  return selectedOption.textContent.replace(/\s+/g, " ").trim();
}

elements.birthMonth.addEventListener("change", persistStartDraft);
elements.musicBackground.addEventListener("change", persistStartDraft);

elements.resumeContinueButton.addEventListener("click", () => {
  continueSurvey();
});

function bindResumeRestartButton() {
  const restart = document.getElementById("resume-restart-button");
  if (!restart) {
    return;
  }
  restart.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    discardSurveyProgress();
  });
}

bindResumeRestartButton();


window.addEventListener("beforeunload", flushInProgressAnswer);
window.addEventListener("pagehide", flushInProgressAnswer);

render();
