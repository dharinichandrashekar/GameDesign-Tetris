"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const WIDTH = 10;
  const TRIAL_DURATION_MS = 7 * 60 * 1000; // Seven minutes of active play, excluding pauses.
  const HEIGHT = 20;
  const LOCK_DELAY_MS = 500;
  const MAX_LOCK_RESETS = 15;
  const DAS_MS = 170;
  const ARR_MS = 50;
  const PIECE_NAMES = ["L", "J", "O", "I", "T", "S", "Z"];
  const STATUS_LABELS = { ready: "Ready", playing: "Playing", paused: "Paused", over: "Game over", trial_over: "Trial over" };
  const COLORS = ["#ff9f1c", "#287de1", "#ffd500", "#00c8df", "#a453d8", "#44c36d", "#e54a4a"];
  // Tetromino indices: L, J, O, I, T, S, Z.

  const grid = document.querySelector("#game-grid");
  const nextGrid = document.querySelector("#next-grid");
  const holdGrid = document.querySelector("#hold-grid");
  const scoreDisplay = document.querySelector("#score");
  const linesDisplay = document.querySelector("#lines");
  const levelDisplay = document.querySelector("#level");
  const piecesDisplay = document.querySelector("#pieces");
  const timeDisplay = document.querySelector("#time");
  const statusDisplay = document.querySelector("#status");
  const statusPanel = document.querySelector("#status-panel");
  const startButton = document.querySelector("#start-button");
  const resetButton = document.querySelector("#reset-button");
  const exportButton = document.querySelector("#export-button");
  const playerIdInput = document.querySelector("#player-id");
  const exportFeedback = document.querySelector("#export-feedback");
  const logSummary = document.querySelector("#log-summary");
  const storageNotice = document.querySelector("#storage-notice");
  const resetDialog = document.querySelector("#reset-dialog");
  const resetConfirmButton = document.querySelector("#reset-confirm");
  const resetExportAllButton = document.querySelector("#reset-export-all");
  const confirmationDialog = document.querySelector("#confirmation-dialog");
  const confirmationTitle = document.querySelector("#confirmation-title");
  const confirmationDetails = document.querySelector("#confirmation-details");
  const confirmationCloseButton = document.querySelector("#confirmation-close");
  const resetDataSummary = document.querySelector("#reset-data-summary");
  const switchIdButton = document.querySelector("#switch-id-button");
  const switchDialog = document.querySelector("#switch-dialog");
  const switchConfirmButton = document.querySelector("#switch-confirm");
  const switchDataSummary = document.querySelector("#switch-data-summary");

  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    statusDisplay.textContent = "Browser unsupported";
    startButton.disabled = true;
    resetButton.disabled = true;
    exportButton.disabled = true;
    return;
  }

  function createCells(container, count) {
    const nodes = Array.from({ length: count }, () => {
      const cell = document.createElement("div");
      cell.className = "cell";
      return cell;
    });
    container.replaceChildren(...nodes);
    return nodes;
  }
  const squares = createCells(grid, WIDTH * HEIGHT);
  const nextSquares = createCells(nextGrid, 16);
  const holdSquares = createCells(holdGrid, 16);

  // Rotations use the 3x3 (or 4x4 for I) guideline rotation boxes.
  function makeRotations(cells, size) {
    const rotations = [];
    let points = cells.map(([x, y]) => [x, y]);
    for (let r = 0; r < 4; r++) {
      rotations.push(points.map(([x, y]) => ({ x, y })));
      if (size !== 2) points = points.map(([x, y]) => [size - 1 - y, x]);
    }
    return rotations;
  }

  const SHAPES = [
    makeRotations([[2, 0], [0, 1], [1, 1], [2, 1]], 3), // L
    makeRotations([[0, 0], [0, 1], [1, 1], [2, 1]], 3), // J
    makeRotations([[0, 0], [1, 0], [0, 1], [1, 1]], 2), // O
    makeRotations([[0, 1], [1, 1], [2, 1], [3, 1]], 4), // I
    makeRotations([[1, 0], [0, 1], [1, 1], [2, 1]], 3), // T
    makeRotations([[1, 0], [2, 0], [0, 1], [1, 1]], 3), // S
    makeRotations([[0, 0], [1, 0], [1, 1], [2, 1]], 3), // Z
  ];

  // SRS kicks: [horizontal offset, upward offset].
  const KICKS = {
    "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const I_KICKS = {
    "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  let board;
  let piece;
  let nextType;
  let heldType;
  let holdUsed;
  let bag;
  let score;
  let lines;
  let level;
  let piecesPlaced;
  let state;
  let gravityTimer = null;
  let displayTimer = null;
  let lockTimer = null;
  let lockResets = 0;
  // The clock accumulates ONLY active gameplay. performance.now() measures
  // each active segment; Date.now() separately measures total wall time.
  let trialStartedAtMs = 0;
  let trialFinishedAtMs = 0;
  let trialActiveAccumulatedMs = 0;
  let gameActiveAccumulatedMs = 0;
  let activeSegmentStartedAtPerf = 0;
  let pauseStartedAtMs = 0;
  let pauseReason = "";
  let pauseCount = 0;
  let trialNumber = 0;
  let gameInTrial = 0;
  let gameStartedAtMs = 0;
  let gameEndedAtMs = 0;
  const heldKeys = new Map();
  // Events are retained across new games and non-destructive resets.
  const gameLog = [];
  let gameNumber = 0;
  let activeId = "";
  let exportedCounts = {};
  let storageReady = false;
  let storageMode = "memory";
  let storageProblem = "";
  let database = null;
  let saveQueue = Promise.resolve();
  let lastSnapshotSecond = 0;
  let resetInProgress = false;

  // Inline messages are reserved for validation and failed exports/storage writes.
  function setFeedback(message) {
    exportFeedback.textContent = message;
  }

  // Shared, per-ID trial counts used in previews, exports and acknowledgements.
  function trialBreakdown(rows = gameLog) {
    const counts = new Map();
    for (const row of rows) {
      if (!counts.has(row.id)) counts.set(row.id, new Set());
      // Legacy exports did not include a trial number; treat them as one legacy session.
      counts.get(row.id).add(Number.isInteger(row.trial) ? row.trial : "legacy");
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b))
      .map(([id, trials]) => `ID: ${id}, trials: ${trials.size}`)
      .join("\n") || "No saved trials";
  }

  function pageIsActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  // Entering a modal pauses active-play time, just like a manual pause.
  // Closing a modal NEVER automatically restarts gameplay.
  function suspendForDialog(reason = "dialog") {
    if (state === "playing") pauseGame(reason);
  }

  function showConfirmation(title, details) {
    setFeedback("");
    suspendForDialog();
    confirmationTitle.textContent = title;
    confirmationDetails.textContent = details;
    // The user must explicitly dismiss the confirmation with × or Escape.
    if (!confirmationDialog.open) confirmationDialog.showModal();
  }

  confirmationCloseButton.addEventListener("click", () => confirmationDialog.close());
  // Native Esc cancellation closes this notification; no extra confirmation needed.

  const DB_NAME = "tetris_saved_game_logs_v1";
  const FALLBACK_KEY = "tetris_saved_game_logs_fallback_v1";

  function formatElapsedTime(milliseconds) {
    const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function idRows(id) {
    return gameLog.filter((row) => row.id === id);
  }

  function idGameCount(id) {
    return new Set(idRows(id).map((row) => row.game)).size;
  }

  function metadata() {
    return { activeId, exportedCounts: { ...exportedCounts }, savedAt: Date.now() };
  }

  function updateLogControls() {
    const totalTrials = new Set(gameLog.map((row) => `${row.id}\u0000${Number.isInteger(row.trial) ? row.trial : "legacy"}`)).size;
    // Trial over is terminal; Reset game is required for a new trial.
    startButton.disabled = !storageReady || resetInProgress || state === "trial_over";
    resetButton.disabled = !storageReady || resetInProgress;
    exportButton.disabled = !storageReady || resetInProgress;
    playerIdInput.readOnly = Boolean(activeId);
    playerIdInput.title = activeId ? "ID is locked. Use Switch ID to change players without deleting logs." : "Enter an ID to begin.";
    switchIdButton.disabled = !storageReady || !activeId || resetInProgress;
    logSummary.textContent = `Saved trials: ${totalTrials}`;
    storageNotice.textContent = storageProblem || (storageMode === "indexeddb" ? "Auto-saved in this browser" :
      storageMode === "localstorage" ? "Auto-saved in browser storage (limited capacity)" : "Not saved to disk: export regularly");
  }

  function storageFailure(error) {
    storageProblem = "Auto-save failed. Export CSV now; closing the page may lose new data.";
    console.error("Tetris log save failed:", error);
    setFeedback(storageProblem);
    updateLogControls();
  }

  function persistFallback() {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify({ version: 1, rows: gameLog, ...metadata() }));
      return true;
    } catch (error) {
      storageFailure(error);
      return false;
    }
  }

  // Write each event in order. Session resets preserve historical events.
  function enqueueSave(row = null) {
    if (!storageReady) return;
    if (storageMode === "localstorage") {
      persistFallback();
      return;
    }
    if (storageMode !== "indexeddb") return;
    const meta = metadata();
    saveQueue = saveQueue.then(() => new Promise((resolve, reject) => {
      const tx = database.transaction(["rows", "meta"], "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      const rows = tx.objectStore("rows");
      if (row) rows.add(row);
      tx.objectStore("meta").put({ key: "session", ...meta });
    })).catch((error) => {
      // A failed IndexedDB write must not silently drop in-memory data.
      storageFailure(error);
      storageMode = "localstorage";
      persistFallback();
      updateLogControls();
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows", { autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function readDatabase(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["rows", "meta"], "readonly");
      const rowsRequest = tx.objectStore("rows").getAll();
      const metaRequest = tx.objectStore("meta").get("session");
      tx.oncomplete = () => resolve({ rows: rowsRequest.result || [], meta: metaRequest.result || {} });
      tx.onerror = () => reject(tx.error);
    });
  }

  function loadFallback() {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      return { rows: Array.isArray(saved.rows) ? saved.rows : [], meta: saved };
    } catch (error) {
      storageFailure(error);
      return { rows: [], meta: {} };
    }
  }

  function closeInterruptedGames() {
    // An unfinished GAME is not necessarily an unfinished TRIAL: participants
    // may be sitting at "Game over" while their seven-minute clock still runs.
    const lastPerTrial = new Map();
    const closedTrials = new Set();
    const legacyLastPerGame = new Map();
    const closedLegacyGames = new Set();
    for (const row of gameLog) {
      if (Number.isInteger(row.trial) && row.trial > 0) {
        const key = `${row.id}\u0000${row.trial}`;
        lastPerTrial.set(key, row);
        if (["trial_over", "trial_interrupted", "interrupted_reload"].includes(row.event)) closedTrials.add(key);
      } else {
        const key = `${row.id}\u0000${row.game}`;
        legacyLastPerGame.set(key, row);
        if (["game_over", "game_reset", "interrupted_reload", "interrupted_switch"].includes(row.event)) closedLegacyGames.add(key);
      }
    }
    for (const [key, row] of lastPerTrial) {
      if (closedTrials.has(key)) continue;
      const interrupted = {
        ...row, timestamp_utc: new Date().toISOString(), event: "trial_interrupted",
        status: "Interrupted", game_status_at_cutoff: "",
        details: "Page was reloaded or closed before the seven-minute trial ended",
      };
      gameLog.push(interrupted);
      enqueueSave(interrupted);
    }
    // Older logs did not have a separate trial identifier.
    for (const [key, row] of legacyLastPerGame) {
      if (closedLegacyGames.has(key)) continue;
      const interrupted = {
        ...row, timestamp_utc: new Date().toISOString(), event: "interrupted_reload",
        status: "Interrupted", details: "Page was reloaded or closed before the game finished",
      };
      gameLog.push(interrupted);
      enqueueSave(interrupted);
    }
  }

  async function initializeStorage() {
    let loaded;
    try {
      database = await openDatabase();
      loaded = await readDatabase(database);
      storageMode = "indexeddb";
      // If IndexedDB previously failed and switched to localStorage, recover
      // the newer fallback instead of silently discarding its extra events.
      const fallback = loadFallback();
      const fallbackIsNewer = fallback.rows.length && (
        fallback.rows.length > loaded.rows.length ||
        (fallback.rows.length === loaded.rows.length &&
          (fallback.meta.savedAt || 0) > (loaded.meta.savedAt || 0))
      );
      if (fallbackIsNewer) {
        await new Promise((resolve, reject) => {
          const tx = database.transaction(["rows", "meta"], "readwrite");
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          const rowStore = tx.objectStore("rows");
          rowStore.clear();
          for (const row of fallback.rows) rowStore.add(row);
          tx.objectStore("meta").put({ key: "session", ...{
            activeId: fallback.meta.activeId || "",
            exportedCounts: fallback.meta.exportedCounts || {},
            savedAt: fallback.meta.savedAt || Date.now(),
          } });
        });
        loaded = fallback;
        try { localStorage.removeItem(FALLBACK_KEY); } catch (_) { /* Keep DB copy. */ }
      }
    } catch (error) {
      if (database) database.close();
      database = null;
      loaded = loadFallback();
      storageMode = "localstorage";
    }
    for (const row of loaded.rows || []) {
      if (row && typeof row.id === "string" && Number.isInteger(row.game) && row.game > 0) gameLog.push(row);
    }
    activeId = typeof loaded.meta?.activeId === "string" ? loaded.meta.activeId : "";
    exportedCounts = loaded.meta?.exportedCounts && typeof loaded.meta.exportedCounts === "object"
      ? loaded.meta.exportedCounts : {};
    playerIdInput.value = activeId;
    storageReady = true;
    closeInterruptedGames();
    prepareGame();
    enqueueSave();
    updateLogControls();
  }

  function trialIsRunning() {
    return trialStartedAtMs > 0 && trialFinishedAtMs === 0;
  }

  function elapsedMs() {
    const inProgress = state === "playing" && activeSegmentStartedAtPerf > 0
      ? Math.max(0, performance.now() - activeSegmentStartedAtPerf) : 0;
    return Math.min(TRIAL_DURATION_MS, trialActiveAccumulatedMs + inProgress);
  }

  function gameActiveMs() {
    const inProgress = state === "playing" && activeSegmentStartedAtPerf > 0
      ? Math.max(0, performance.now() - activeSegmentStartedAtPerf) : 0;
    return gameActiveAccumulatedMs + inProgress;
  }

  function wallElapsedMs() {
    if (!trialStartedAtMs) return 0;
    return Math.max(0, (trialFinishedAtMs || Date.now()) - trialStartedAtMs);
  }

  function accumulateActiveTime() {
    if (state === "playing" && activeSegmentStartedAtPerf > 0) {
      const delta = Math.max(0, performance.now() - activeSegmentStartedAtPerf);
      // Never credit active time beyond the experimental cutoff.
      const credited = Math.min(delta, Math.max(0, TRIAL_DURATION_MS - trialActiveAccumulatedMs));
      trialActiveAccumulatedMs += credited;
      gameActiveAccumulatedMs += credited;
      activeSegmentStartedAtPerf = 0;
    }
  }

  function startActiveSegment() {
    activeSegmentStartedAtPerf = Math.max(0.001, performance.now());
  }

  function closePauseInterval() {
    if (!pauseStartedAtMs) return;
    const duration = Math.max(0, Date.now() - pauseStartedAtMs);
    logEvent("pause_ended", `${pauseReason}; pause duration ${(duration / 1000).toFixed(2)} seconds`);
    pauseStartedAtMs = 0;
    pauseReason = "";
  }

  function serializeBoard() {
    // Ten characters per row, twenty rows; lower-case means active falling piece.
    // This captures the full displayed board, not just score/lines.
    const result = board.map((row) => row.map((type) => type === null ? "." : PIECE_NAMES[type]));
    if (piece !== null) {
      for (const { x, y } of cellsFor(piece)) {
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) result[y][x] = PIECE_NAMES[piece.type].toLowerCase();
      }
    }
    return result.map((row) => row.join("")).join("/");
  }

  function makeEventRow(event, details = "", statusOverride = "", options = {}) {
    const ms = elapsedMs();
    const wallMs = wallElapsedMs();
    const gameEnd = gameEndedAtMs || (trialFinishedAtMs || Date.now());
    const gameWallMs = gameStartedAtMs ? Math.max(0, gameEnd - gameStartedAtMs) : 0;
    return {
      id: activeId,
      trial: trialNumber,
      game: gameNumber,
      game_in_trial: gameInTrial,
      trial_started_utc: new Date(trialStartedAtMs).toISOString(),
      timestamp_utc: new Date(options.timestampMs || Date.now()).toISOString(),
      event,
      status: statusOverride || STATUS_LABELS[state],
      game_status_at_cutoff: options.gameStatusAtCutoff || "",
      elapsed_mm_ss: formatElapsedTime(ms),
      elapsed_seconds: (ms / 1000).toFixed(2),
      trial_wall_elapsed_seconds: (wallMs / 1000).toFixed(2),
      trial_paused_seconds: (Math.max(0, wallMs - ms) / 1000).toFixed(2),
      pause_count: pauseCount,
      game_elapsed_seconds: (gameWallMs / 1000).toFixed(2),
      game_active_seconds: (gameActiveMs() / 1000).toFixed(2),
      score,
      lines,
      level,
      pieces_placed: piecesPlaced,
      current_piece: piece === null ? "" : PIECE_NAMES[piece.type],
      current_piece_x: piece === null ? "" : piece.x,
      current_piece_y: piece === null ? "" : piece.y,
      current_piece_rotation: piece === null ? "" : piece.rotation,
      next_piece: PIECE_NAMES[nextType],
      held_piece: heldType === null ? "" : PIECE_NAMES[heldType],
      board_state: serializeBoard(),
      details,
    };
  }

  function appendEvent(row) {
    gameLog.push(row);
    enqueueSave(row);
    updateLogControls();
  }

  function logEvent(event, details = "", statusOverride = "", options = {}) {
    if (!activeId || gameNumber === 0) return;
    appendEvent(makeEventRow(event, details, statusOverride, options));
  }

  function finishTrial() {
    if (!trialIsRunning() || state !== "playing") return;
    const statusAtCutoff = STATUS_LABELS[state];
    accumulateActiveTime();
    trialActiveAccumulatedMs = TRIAL_DURATION_MS;
    gameEndedAtMs = Date.now();
    trialFinishedAtMs = Date.now();
    state = "trial_over";
    stopTimers();
    stopTrialClock();
    render(); // Keep the board exactly as it was when time expired.
    updateDisplay();
    logEvent("trial_over", `Seven active-play minutes completed; ${gameInTrial} game(s) started`,
      "Trial over", { gameStatusAtCutoff: statusAtCutoff });
  }

  function checkTrialDeadline() {
    if (!trialIsRunning() || state !== "playing") return false;
    if (elapsedMs() < TRIAL_DURATION_MS) return false;
    finishTrial();
    return true;
  }

  // Research CSV: exactly twelve requested variables. The in-browser event
  // history remains detailed for persistence and recovery, but exported rows
  // represent meaningful game/trial status changes rather than every action
  // or the once-per-second snapshots. The event itself is not a CSV column.
  const CSV_COLUMNS = [
    ["ID", "id"],
    ["Trial", "trial"],
    ["Game", "game"],
    ["Game within trial", "game_in_trial"],
    ["Status", "export_status"],
    ["Game status cutoff", "export_game_status_cutoff"],
    ["Trial Time (active trial in minutes)", "export_trial_minutes"],
    ["Time (active trial in seconds)", "export_trial_seconds"],
    ["Score", "score"],
    ["Lines", "lines"],
    ["Level", "level"],
    ["Number of pieces placed", "pieces_placed"],
  ];

  const CSV_STATUS_EVENTS = {
    started: "Playing",
    resumed: "Playing",
    paused: "Paused",
    game_over: "Game over",
    trial_over: "Trial over",
  };

  function csvResearchRows(rows) {
    return rows.flatMap((row) => {
      const status = CSV_STATUS_EVENTS[row.event];
      if (!status) return []; // Hide piece events, snapshots and internal metadata.
      const seconds = Number(row.elapsed_seconds);
      const activeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      // Game over is the end of an individual game. Trial over means the
      // active game was stopped by the seven-minute trial cutoff.
      const gameStatusCutoff = row.event === "game_over" ? "Game over" :
        row.event === "trial_over"
          ? (row.game_status_at_cutoff === "Game over" ? "Game over" : "Playing") : "";
      return [{
        ...row,
        export_status: status,
        export_game_status_cutoff: gameStatusCutoff,
        export_trial_minutes: (activeSeconds / 60).toFixed(3),
        export_trial_seconds: activeSeconds.toFixed(2),
      }];
    });
  }

  function downloadCSV(rows, filename) {
    let url = null;
    let link = null;
    try {
      const csvCell = (value) => {
        const plain = String(value ?? "");
        const safe = /^[\s]*[=+\-@]/.test(plain) ? `'${plain}` : plain;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const researchRows = csvResearchRows(rows);
      const csv = [CSV_COLUMNS.map(([name]) => csvCell(name)).join(","),
        ...researchRows.map((row) => CSV_COLUMNS.map(([, key]) => csvCell(row[key])).join(","))
      ].join("\r\n");
      url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click(); // Browser APIs cannot confirm that a download finished saving.
      return true;
    } catch (error) {
      console.error("CSV download could not start:", error);
      return false;
    } finally {
      if (link) link.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function csvDateStamp() {
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
  }

  function exportGameLog() {
    checkTrialDeadline();
    const id = activeId || playerIdInput.value.trim();
    if (!id || !idRows(id).length) {
      setFeedback("Enter an ID with saved game logs before exporting.");
      return false;
    }
    suspendForDialog("csv_export"); // An export must not consume active play time.
    if (trialIsRunning()) logEvent("export_requested", "CSV download initiated");
    const rows = idRows(id);
    const safeId = id.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "ID";
    if (!downloadCSV(rows, `Tetris_game_log_${csvDateStamp()}_${safeId}.csv`)) {
      setFeedback("Download could not be initiated. Retry Export CSV.");
      return false;
    }
    exportedCounts[id] = rows.length;
    enqueueSave();
    showConfirmation("CSV download initiated", `${trialBreakdown(rows)}\n\nVerify that the file was saved. The game remains paused until you select Resume.`);
    return true;
  }

  // Use unbiased, browser-provided cryptographic randomness for every shuffle.
  // The seven-bag constraint prevents droughts, but the next type is still
  // inferable when only one type remains in the current bag.
  function randomInt(maxExclusive) {
    const domain = 0x100000000;
    const upperBound = domain - (domain % maxExclusive);
    const value = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(value);
    } while (value[0] >= upperBound);
    return value[0] % maxExclusive;
  }

  function takePiece() {
    if (bag.length === 0) {
      bag = Array.from({ length: SHAPES.length }, (_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function newPiece(type) {
    return { type, rotation: 0, x: type === 2 ? 4 : 3, y: 0 };
  }

  function cellsFor(candidate) {
    return SHAPES[candidate.type][candidate.rotation].map(({ x, y }) => ({
      x: candidate.x + x,
      y: candidate.y + y,
    }));
  }

  function canPlace(candidate) {
    return cellsFor(candidate).every(({ x, y }) =>
      x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && board[y][x] === null
    );
  }

  function isGrounded() {
    return piece !== null && !canPlace({ ...piece, y: piece.y + 1 });
  }

  function paintPreview(squaresToPaint, type) {
    squaresToPaint.forEach((square) => {
      square.className = "cell";
      square.style.backgroundColor = "";
    });
    if (type === null) return;
    SHAPES[type][0].forEach(({ x, y }) => {
      const square = squaresToPaint[y * 4 + x];
      square.classList.add("filled");
      square.style.backgroundColor = COLORS[type];
    });
  }

  function render() {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const square = squares[y * WIDTH + x];
        const type = board[y][x];
        square.className = type === null ? "cell" : "cell filled locked";
        square.style.backgroundColor = type === null ? "" : COLORS[type];
      }
    }

    if (piece !== null && state !== "ready") {
      const ghost = { ...piece };
      while (canPlace({ ...ghost, y: ghost.y + 1 })) ghost.y++;
      const occupied = new Set(cellsFor(piece).map(({ x, y }) => y * WIDTH + x));
      cellsFor(ghost).forEach(({ x, y }) => {
        const index = y * WIDTH + x;
        if (!occupied.has(index)) squares[index].classList.add("ghost");
      });
      cellsFor(piece).forEach(({ x, y }) => {
        const square = squares[y * WIDTH + x];
        square.classList.add("filled", "active");
        square.style.backgroundColor = COLORS[piece.type];
      });
    }

    paintPreview(nextSquares, nextType);
    paintPreview(holdSquares, heldType);
    holdGrid.classList.toggle("used", holdUsed);
  }

  function updateDisplay() {
    scoreDisplay.textContent = score.toLocaleString();
    linesDisplay.textContent = String(lines);
    levelDisplay.textContent = String(level);
    piecesDisplay.textContent = String(piecesPlaced);
    timeDisplay.textContent = formatElapsedTime(elapsedMs());
    statusDisplay.textContent = STATUS_LABELS[state];
    statusPanel.dataset.state = state;
    startButton.textContent = {
      ready: "Start Game",
      playing: "Pause",
      paused: "Resume",
      over: "New game",
      trial_over: "Trial over",
    }[state];
    if (storageReady) updateLogControls();
  }

  function clearLockTimer() {
    if (lockTimer !== null) clearTimeout(lockTimer);
    lockTimer = null;
  }

  function updateLockTimer(playerMoved = false) {
    if (state !== "playing" || piece === null || checkTrialDeadline()) return;
    if (!isGrounded()) {
      clearLockTimer();
      return;
    }
    if (lockTimer !== null) {
      if (!playerMoved || lockResets >= MAX_LOCK_RESETS) return;
      clearLockTimer();
      lockResets++;
    }
    lockTimer = setTimeout(() => {
      lockTimer = null;
      if (state === "playing" && !checkTrialDeadline() && isGrounded()) lockPiece();
    }, LOCK_DELAY_MS);
  }

  function stopKeyRepeat(code) {
    const key = heldKeys.get(code);
    if (!key) return;
    clearTimeout(key.delay);
    clearInterval(key.interval);
    heldKeys.delete(code);
  }

  function stopAllKeyRepeats() {
    for (const code of [...heldKeys.keys()]) stopKeyRepeat(code);
  }

  function startKeyRepeat(code, action) {
    if (heldKeys.has(code)) return;
    action();
    const key = { delay: null, interval: null };
    heldKeys.set(code, key);
    key.delay = setTimeout(() => {
      if (state !== "playing" || !heldKeys.has(code)) return;
      action();
      key.interval = setInterval(() => {
        if (state === "playing") action();
      }, ARR_MS);
    }, DAS_MS);
  }

  function stopTimers() {
    // Game physics only. The display clock is managed separately.
    clearInterval(gravityTimer);
    gravityTimer = null;
    clearLockTimer();
    stopAllKeyRepeats();
  }

  function stopTrialClock() {
    clearInterval(displayTimer);
    displayTimer = null;
  }

  function gravityMs() {
    return Math.max(80, Math.round(1000 * Math.pow(0.8, level - 1)));
  }

  function restartGravity() {
    clearInterval(gravityTimer);
    if (state === "playing") gravityTimer = setInterval(() => moveDown(false), gravityMs());
  }

  function startTimers() {
    restartGravity();
    updateLockTimer();
  }

  function startTrialClock() {
    stopTrialClock();
    displayTimer = setInterval(() => {
      if (checkTrialDeadline()) return;
      updateDisplay();
      const currentSecond = Math.floor(elapsedMs() / 1000);
      if (state === "playing" && currentSecond > lastSnapshotSecond) {
        lastSnapshotSecond = currentSecond;
        logEvent("snapshot");
      }
    }, 100);
  }

  function endGame(reason = "New piece could not spawn") {
    if (state !== "playing" || checkTrialDeadline()) return;
    accumulateActiveTime();
    gameEndedAtMs = Date.now();
    state = "over";
    pauseStartedAtMs = Date.now();
    pauseReason = "game_over";
    pauseCount++;
    stopTimers(); // Game over also pauses the seven-minute active-play clock.
    render();
    updateDisplay();
    logEvent("game_over", reason);
  }

  function spawnNext() {
    piece = newPiece(nextType);
    nextType = takePiece();
    holdUsed = false;
    lockResets = 0;
    if (!canPlace(piece)) {
      piece = null;
      endGame();
      return;
    }
    render();
    updateLockTimer();
  }

  function lockPiece() {
    if (state !== "playing" || piece === null || checkTrialDeadline()) return;
    clearLockTimer();
    const lockedType = piece.type;
    cellsFor(piece).forEach(({ x, y }) => { board[y][x] = piece.type; });
    piecesPlaced++;
    piece = null;
    logEvent("piece_locked", PIECE_NAMES[lockedType]);

    // Work on the logical board. Rows cannot be confused with the grid's DOM nodes.
    const keptRows = board.filter((row) => row.some((type) => type === null));
    const cleared = HEIGHT - keptRows.length;
    board = [
      ...Array.from({ length: cleared }, () => Array(WIDTH).fill(null)),
      ...keptRows,
    ];
    if (cleared) {
      score += [0, 100, 300, 500, 800][cleared] * level;
      lines += cleared;
      logEvent("lines_cleared", String(cleared));
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel !== level) {
        level = newLevel;
        restartGravity();
        logEvent("level_up", String(level));
      }
    }
    spawnNext();
    updateDisplay();
  }

  function moveDown(isSoftDrop) {
    if (state !== "playing" || piece === null || checkTrialDeadline()) return;
    const candidate = { ...piece, y: piece.y + 1 };
    if (canPlace(candidate)) {
      piece = candidate;
      if (isSoftDrop) score++;
      render();
      updateLockTimer();
      updateDisplay();
    } else {
      updateLockTimer();
    }
  }

  function moveHorizontal(dx) {
    if (state !== "playing" || piece === null || checkTrialDeadline()) return;
    const candidate = { ...piece, x: piece.x + dx };
    if (!canPlace(candidate)) return;
    piece = candidate;
    render();
    updateLockTimer(true);
  }

  function rotate(direction) {
    if (state !== "playing" || piece === null || checkTrialDeadline()) return;
    const newRotation = (piece.rotation + direction + 4) % 4;
    const candidates = piece.type === 2 ? [[0, 0]] :
      (piece.type === 3 ? I_KICKS : KICKS)[`${piece.rotation}>${newRotation}`];
    for (const [dx, dyUp] of candidates) {
      const candidate = {
        ...piece,
        rotation: newRotation,
        x: piece.x + dx,
        y: piece.y - dyUp,
      };
      if (!canPlace(candidate)) continue;
      piece = candidate;
      render();
      updateLockTimer(true);
      return;
    }
  }

  function hardDrop() {
    if (state !== "playing" || piece === null || checkTrialDeadline()) return;
    let distance = 0;
    while (canPlace({ ...piece, y: piece.y + 1 })) {
      piece.y++;
      distance++;
    }
    score += distance * 2;
    logEvent("hard_drop", `${distance} rows`);
    lockPiece();
  }

  function hold() {
    if (state !== "playing" || piece === null || holdUsed || checkTrialDeadline()) return;
    clearLockTimer();
    const previousType = piece.type;
    if (heldType === null) {
      piece = newPiece(nextType);
      nextType = takePiece();
    } else {
      piece = newPiece(heldType);
    }
    heldType = previousType;
    holdUsed = true;
    logEvent("hold", PIECE_NAMES[previousType]);
    lockResets = 0;
    if (!canPlace(piece)) {
      piece = null;
      endGame();
      return;
    }
    render();
    updateLockTimer();
  }

  function prepareGame(preserveTrial = false) {
    stopTimers();
    if (!preserveTrial) {
      stopTrialClock();
      trialStartedAtMs = 0;
      trialFinishedAtMs = 0;
      trialActiveAccumulatedMs = 0;
      activeSegmentStartedAtPerf = 0;
      pauseStartedAtMs = 0;
      pauseReason = "";
      pauseCount = 0;
      trialNumber = 0;
      gameInTrial = 0;
      lastSnapshotSecond = 0;
    }
    gameNumber = 0;
    gameStartedAtMs = 0;
    gameEndedAtMs = 0;
    gameActiveAccumulatedMs = 0;
    board = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
    bag = [];
    piece = newPiece(takePiece());
    nextType = takePiece();
    heldType = null;
    holdUsed = false;
    score = 0;
    lines = 0;
    level = 1;
    piecesPlaced = 0;
    lockResets = 0;
    state = "ready";
    render();
    updateDisplay();
  }

  function startNewGame() {
    if (!pageIsActive() || resetDialog.open || switchDialog.open || confirmationDialog.open ||
        state === "trial_over") return;
    const requestedId = activeId || playerIdInput.value.trim();
    if (!requestedId) {
      setFeedback("Enter an ID before starting a game.");
      playerIdInput.focus();
      return;
    }
    if (!activeId) activeId = requestedId;
    playerIdInput.value = activeId;
    if (!trialIsRunning()) {
      trialNumber = idRows(activeId).reduce((max, row) =>
        Math.max(max, Number.isInteger(row.trial) ? row.trial : 1), 0) + 1;
      trialStartedAtMs = Date.now();
      trialFinishedAtMs = 0;
      trialActiveAccumulatedMs = 0;
      activeSegmentStartedAtPerf = 0;
      pauseStartedAtMs = 0;
      pauseReason = "";
      pauseCount = 0;
      gameInTrial = 0;
      lastSnapshotSecond = 0;
    }
    if (checkTrialDeadline()) return;
    gameNumber = idRows(activeId).reduce((max, row) => Math.max(max, row.game), 0) + 1;
    gameInTrial++;
    gameStartedAtMs = Date.now();
    gameEndedAtMs = 0;
    gameActiveAccumulatedMs = 0;
    state = "playing";
    startActiveSegment();
    startTimers();
    if (displayTimer === null) startTrialClock();
    render();
    logEvent("started", gameInTrial === 1 ? "Trial started" : "New game within existing trial");
    updateDisplay();
    updateLogControls();
    setFeedback("");
  }

  function pauseGame(reason = "manual", record = true) {
    if (state !== "playing" || checkTrialDeadline()) return;
    accumulateActiveTime();
    state = "paused";
    pauseStartedAtMs = Date.now();
    pauseReason = reason;
    pauseCount++;
    stopTimers();
    updateDisplay();
    if (record) logEvent("paused", reason);
  }

  function resumeGame(record = true) {
    if (state !== "paused" || !pageIsActive() || resetInProgress ||
        resetDialog.open || switchDialog.open || confirmationDialog.open) return;
    closePauseInterval();
    state = "playing";
    startActiveSegment();
    startTimers();
    render();
    updateDisplay();
    if (record) logEvent("resumed");
  }

  function toggleStartPause() {
    if (checkTrialDeadline() || state === "trial_over") return;
    if (state === "over") {
      closePauseInterval(); // Log game-over wait time against the previous game.
      prepareGame(true);   // Keep the ID and accumulated seven-minute clock.
    }
    if (state === "ready") startNewGame();
    else if (state === "paused") resumeGame();
    else if (state === "playing") pauseGame();
    updateDisplay();
    updateLogControls();
  }

  function requestReset() {
    if (!storageReady || resetInProgress || resetDialog.open || confirmationDialog.open || switchDialog.open) return;
    suspendForDialog();
    resetDataSummary.textContent = trialBreakdown();
    resetConfirmButton.disabled = false;
    resetExportAllButton.disabled = false;
    resetDialog.showModal();
    document.querySelector("#reset-cancel").focus();
  }

  function requestSwitch() {
    if (!storageReady || !activeId || resetInProgress || switchDialog.open || resetDialog.open || confirmationDialog.open) return;
    suspendForDialog();
    switchDataSummary.textContent = trialBreakdown(idRows(activeId));
    switchDialog.showModal();
    document.querySelector("#switch-cancel").focus();
  }

  function confirmSwitch() {
    if (!switchDialog.open) return;
    // A mid-trial switch interrupts the trial; previous events remain saved.
    if (!checkTrialDeadline() && trialIsRunning() && gameNumber) {
      logEvent("trial_interrupted", "Player ID changed before the 7-minute cutoff", "Interrupted");
    }
    activeId = "";
    playerIdInput.value = "";
    prepareGame();
    enqueueSave();
    updateLogControls();
    switchDialog.close();
    playerIdInput.focus();
  }

  function resetSession() {
    activeId = "";
    playerIdInput.value = "";
    prepareGame(); // Reset participant, board and active timer. Retain all saved logs.
    enqueueSave();
    resetDialog.close();
    updateLogControls();
    document.getElementById("data-management").open = false;
  }

  function exportAllLogsAndReset() {
    if (resetInProgress || !resetDialog.open) return false;
    if (!gameLog.length) {
      resetDataSummary.textContent = "No saved trials to download. Use 'Reset without download' instead.";
      return false;
    }
    resetInProgress = true;
    resetConfirmButton.disabled = true;
    resetExportAllButton.disabled = true;
    // Include an interrupted-trial terminal row IN the exported CSV when
    // resetting before seven active minutes. Commit only after click succeeds.
    const interruptedRow = trialIsRunning() && gameNumber
      ? makeEventRow("trial_interrupted", "Download CSV & Reset selected before seven active-play minutes", "Interrupted")
      : null;
    const rows = interruptedRow ? [...gameLog, interruptedRow] : [...gameLog];
    const success = downloadCSV(rows, `Tetris_Log_${csvDateStamp()}_ALL_IDS.csv`);
    if (success) {
      if (interruptedRow) appendEvent(interruptedRow);
      for (const id of new Set(rows.map((row) => row.id))) exportedCounts[id] = idRows(id).length;
      resetSession();
      showConfirmation("CSV download initiated and game reset",
        `The PID, board and trial timer are cleared. Saved logs were retained in this browser.\n\nVerify that the CSV file was saved before the next participant.`);
    } else {
      resetDataSummary.textContent = "Download could not be initiated. The game has NOT been reset; please retry or choose Reset without download.";
    }
    resetInProgress = false;
    resetConfirmButton.disabled = false;
    resetExportAllButton.disabled = false;
    updateLogControls();
    return success;
  }

  function confirmResetGame() {
    if (resetInProgress || !resetDialog.open) return;
    resetInProgress = true;
    resetConfirmButton.disabled = true;
    resetExportAllButton.disabled = true;
    if (trialIsRunning() && gameNumber) {
      logEvent("trial_interrupted", "Reset without download selected before seven active-play minutes", "Interrupted");
    }
    resetSession();
    resetInProgress = false;
    resetConfirmButton.disabled = false;
    resetExportAllButton.disabled = false;
    updateLogControls();
    showConfirmation("Game reset", "Player ID, board and active-play timer cleared.\nAll saved trial logs were retained in this browser.");
  }

  resetConfirmButton.addEventListener("click", confirmResetGame);
  resetExportAllButton.addEventListener("click", exportAllLogsAndReset);
  document.querySelector("#reset-cancel").addEventListener("click", () => resetDialog.close());
  resetDialog.addEventListener("cancel", (event) => {
    if (resetInProgress) event.preventDefault();
  });
  switchIdButton.addEventListener("click", requestSwitch);
  switchConfirmButton.addEventListener("click", confirmSwitch);
  document.querySelector("#switch-cancel").addEventListener("click", () => switchDialog.close());

  document.addEventListener("keydown", (event) => {
    // Allow native Escape-to-close behavior while a confirmation dialog is open.
    if (resetDialog.open || switchDialog.open || confirmationDialog.open) return;
    // Typing in the ID field must not move, rotate or pause the game.
    if (event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable]")) return;
    const controlledKeys = [
      "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "KeyX", "KeyZ",
      "Space", "KeyC", "ShiftLeft", "ShiftRight", "KeyP", "Escape",
    ];
    if (controlledKeys.includes(event.code) &&
        (state === "playing" || state === "paused")) event.preventDefault();

    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) {
      if (state === "playing" || state === "paused") toggleStartPause();
      return;
    }
    if (state !== "playing") return;
    if (["ArrowLeft", "ArrowRight", "ArrowDown"].includes(event.code)) {
      if (event.repeat) return;
      if (event.code === "ArrowLeft") {
        stopKeyRepeat("ArrowRight");
        startKeyRepeat(event.code, () => moveHorizontal(-1));
      } else if (event.code === "ArrowRight") {
        stopKeyRepeat("ArrowLeft");
        startKeyRepeat(event.code, () => moveHorizontal(1));
      } else {
        startKeyRepeat(event.code, () => moveDown(true));
      }
      return;
    }
    if (event.repeat) return;
    if (event.code === "ArrowUp" || event.code === "KeyX") rotate(1);
    else if (event.code === "KeyZ") rotate(-1);
    else if (event.code === "Space") hardDrop();
    else if (["KeyC", "ShiftLeft", "ShiftRight"].includes(event.code)) hold();
  });

  document.addEventListener("keyup", (event) => stopKeyRepeat(event.code));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame("tab_hidden");
    // Returning to the tab does not resume automatically.
  });
  window.addEventListener("blur", () => pauseGame("window_inactive"));
  startButton.addEventListener("click", toggleStartPause);
  resetButton.addEventListener("click", requestReset);
  exportButton.addEventListener("click", exportGameLog);
  playerIdInput.addEventListener("input", () => {
    setFeedback("");
    updateLogControls();
  });

  // Show full instructions on larger screens; collapse them on small viewports
  // to keep the board and controls visible without scrolling.
  const instructions = document.querySelector("#game-instructions");
  const spaciousViewport = window.matchMedia("(min-width: 760px) and (min-height: 620px)");
  instructions.open = spaciousViewport.matches;
  spaciousViewport.addEventListener("change", (event) => {
    instructions.open = event.matches;
  });

  prepareGame();
  initializeStorage();
});
