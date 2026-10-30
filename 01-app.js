"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const WIDTH = 10;
  const HEIGHT = 20;
  const LOCK_DELAY_MS = 500;
  const MAX_LOCK_RESETS = 15;
  const DAS_MS = 170;
  const ARR_MS = 50;
  const PIECE_NAMES = ["L", "J", "O", "I", "T", "S", "Z"];
  const STATUS_LABELS = { ready: "Ready", playing: "Playing", paused: "Paused", over: "Game over" };
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
  let elapsedBeforePause = 0;
  let runningSince = 0;
  const heldKeys = new Map();
  // This log stays in memory only and is preserved across resets in this tab.
  // It records game status and statistics, not individual key presses.
  const gameLog = [];
  let gameNumber = 0;
  let hasStarted = false;
  let lastSnapshotSecond = 0;

  function formatElapsedTime(milliseconds) {
    const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function logEvent(event, details = "") {
    const ms = elapsedMs();
    gameLog.push({
      game: gameNumber,
      timestamp_utc: new Date().toISOString(),
      event,
      status: STATUS_LABELS[state],
      elapsed_mm_ss: formatElapsedTime(ms),
      elapsed_seconds: (ms / 1000).toFixed(2),
      score,
      lines,
      level,
      pieces_placed: piecesPlaced,
      current_piece: piece === null ? "" : PIECE_NAMES[piece.type],
      next_piece: PIECE_NAMES[nextType],
      held_piece: heldType === null ? "" : PIECE_NAMES[heldType],
      details,
    });
    if (event === "started") hasStarted = true;
    exportButton.disabled = !hasStarted;
  }

  function exportGameLog() {
    if (!hasStarted) return;
    const id = playerIdInput.value.trim();
    if (!id) {
      exportFeedback.textContent = "Enter an ID before exporting the game log.";
      playerIdInput.focus();
      return;
    }
    // Keep the exact entered ID in the CSV; normalize only the filename.
    const safeId = id.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    if (!safeId) {
      exportFeedback.textContent = "Use an ID containing at least one letter or number (A-Z, 0-9).";
      playerIdInput.focus();
      return;
    }
    exportFeedback.textContent = "";
    logEvent("log_exported");
    const columns = [
      ["ID", "id"], ["Game", "game"], ["Timestamp (UTC)", "timestamp_utc"],
      ["Event", "event"], ["Status", "status"],
      ["Elapsed (MM:SS)", "elapsed_mm_ss"], ["Elapsed (seconds)", "elapsed_seconds"],
      ["Score", "score"], ["Lines", "lines"], ["Level", "level"],
      ["Pieces placed", "pieces_placed"], ["Current piece", "current_piece"],
      ["Next piece", "next_piece"], ["Held piece", "held_piece"],
      ["Details", "details"],
    ];
    // Guard spreadsheet viewers against interpreting a user-entered ID as a formula.
    const csvCell = (value) => {
      const plain = String(value ?? "");
      const safe = /^[\s]*[=+\-@]/.test(plain) ? `'${plain}` : plain;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [columns.map(([name]) => csvCell(name)).join(","),
      ...gameLog.map((row) => columns.map(([, key]) => csvCell(key === "id" ? id : row[key])).join(","))
    ].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Local date and time, with filename-safe separators (YYYY-MM-DD_HH-mm-ss).
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const time = `${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
    link.download = `Tetris_game_log_${date}_${time}_${safeId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  function elapsedMs() {
    return elapsedBeforePause + (state === "playing" ? performance.now() - runningSince : 0);
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
      ready: "Start",
      playing: "Pause",
      paused: "Resume",
      over: "New game",
    }[state];
  }

  function clearLockTimer() {
    if (lockTimer !== null) clearTimeout(lockTimer);
    lockTimer = null;
  }

  function updateLockTimer(playerMoved = false) {
    if (state !== "playing" || piece === null) return;
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
      if (state === "playing" && isGrounded()) lockPiece();
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
    clearInterval(gravityTimer);
    clearInterval(displayTimer);
    gravityTimer = null;
    displayTimer = null;
    clearLockTimer();
    stopAllKeyRepeats();
  }

  function gravityMs() {
    return Math.max(80, Math.round(1000 * Math.pow(0.8, level - 1)));
  }

  function restartGravity() {
    clearInterval(gravityTimer);
    if (state === "playing") gravityTimer = setInterval(() => moveDown(false), gravityMs());
  }

  function startTimers() {
    runningSince = performance.now();
    restartGravity();
    displayTimer = setInterval(() => {
      updateDisplay();
      const currentSecond = Math.floor(elapsedMs() / 1000);
      if (state === "playing" && currentSecond > lastSnapshotSecond) {
        lastSnapshotSecond = currentSecond;
        logEvent("snapshot");
      }
    }, 100);
    updateLockTimer();
  }

  function endGame(reason = "New piece could not spawn") {
    if (state !== "playing") return;
    elapsedBeforePause = elapsedMs();
    state = "over";
    stopTimers();
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
    if (state !== "playing" || piece === null) return;
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
    if (state !== "playing" || piece === null) return;
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
    if (state !== "playing" || piece === null) return;
    const candidate = { ...piece, x: piece.x + dx };
    if (!canPlace(candidate)) return;
    piece = candidate;
    render();
    updateLockTimer(true);
  }

  function rotate(direction) {
    if (state !== "playing" || piece === null) return;
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
    if (state !== "playing" || piece === null) return;
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
    if (state !== "playing" || piece === null || holdUsed) return;
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

  function resetGame() {
    if (gameNumber > 0 && state !== "ready" && state !== "over") {
      logEvent("reset", "New game requested");
    }
    stopTimers();
    gameNumber++;
    lastSnapshotSecond = 0;
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
    elapsedBeforePause = 0;
    runningSince = 0;
    state = "ready";
    render();
    updateDisplay();
    logEvent("ready");
  }

  function pauseGame() {
    if (state !== "playing") return;
    elapsedBeforePause = elapsedMs();
    state = "paused";
    stopTimers();
    updateDisplay();
    logEvent("paused");
  }

  function toggleStartPause() {
    if (state === "over") resetGame();
    if (state === "ready" || state === "paused") {
      const event = state === "ready" ? "started" : "resumed";
      state = "playing";
      startTimers();
      render();
      logEvent(event);
    } else if (state === "playing") {
      pauseGame();
    }
    updateDisplay();
  }

  document.addEventListener("keydown", (event) => {
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
    if (document.hidden) pauseGame();
  });
  window.addEventListener("blur", pauseGame);
  startButton.addEventListener("click", toggleStartPause);
  resetButton.addEventListener("click", resetGame);
  exportButton.addEventListener("click", exportGameLog);
  playerIdInput.addEventListener("input", () => { exportFeedback.textContent = ""; });

  // Show full instructions on larger screens; collapse them on small viewports
  // to keep the board and controls visible without scrolling.
  const instructions = document.querySelector("#game-instructions");
  const spaciousViewport = window.matchMedia("(min-width: 760px) and (min-height: 620px)");
  instructions.open = spaciousViewport.matches;
  spaciousViewport.addEventListener("change", (event) => {
    instructions.open = event.matches;
  });

  resetGame();
});
