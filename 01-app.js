document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector(".grid");
  let squares = Array.from(document.querySelectorAll(".grid div"));
  const scoreDisplay = document.querySelector("#score");
  const linesDisplay = document.querySelector("#lines");
  const levelDisplay = document.querySelector("#level");
  const piecesDisplay = document.querySelector("#pieces");
  const timeDisplay = document.querySelector("#time");
  const statusDisplay = document.querySelector("#status");
  const startBtn = document.querySelector("#start-button");
  const resetBtn = document.querySelector("#reset-button");
  const width = 10;
  const height = 20;
  const params = new URLSearchParams(window.location.search);
  const experiment = {
    trialId: params.get("trial") || "unlabeled",
    seed: Number.isFinite(Number(params.get("seed"))) && params.has("seed")
      ? (Number(params.get("seed")) >>> 0)
      : 12345,
    durationSeconds: Math.max(0, Number(params.get("duration")) || 0),
    gravityMs: 1000,
    progressiveSpeed: params.get("progression") === "1", // Default fixed for study; ?progression=1 accelerates.
    lockDelayMs: 500,
    maxLockResets: 15,
    enableHold: true,
    enableGhost: true,
    allowPause: params.get("pause") !== "0", // ?pause=0 prevents pausing in a study.
    delayedAutoShiftMs: 170, // fixed keyboard repeat timing across computers
    autoRepeatMs: 50,
  };

  let timerId = null;
  let clockId = null;
  let lockTimerId = null;
  let status = "idle"; // idle, running, paused, finished
  let finishReason = null;
  let score = 0;
  let lines = 0;
  let level = 1;
  let piecesPlaced = 0;
  let lockResets = 0;
  let heldPiece = null;
  let holdUsed = false;
  let activeElapsedMs = 0;
  let sessionStart = 0;
  let randomState = experiment.seed;
  let bag = [];
  let log = [];
  const heldKeys = new Map();
  const colors = ["#ff9f1c", "#287de1", "#ffd500", "#00c8df", "#a453d8", "#44c36d", "#e54a4a"];
  // Shape order: L, J, O, I, T, S, Z (one fixed color per shape).
  const pieceNames = ["L", "J", "O", "I", "T", "S", "Z"];

  function createRotations(cells, size) {
    const rotations = [];
    let points = cells.map(([x, y]) => [x, y]);
    for (let r = 0; r < 4; r++) {
      rotations.push(points.map(([x, y]) => y * width + x));
      if (size !== 2) points = points.map(([x, y]) => [size - 1 - y, x]);
    }
    return rotations;
  }

  // The seven Tetrominoes, in their modern spawn orientations.
  const lTetromino = createRotations([[2, 0], [0, 1], [1, 1], [2, 1]], 3);
  const jTetromino = createRotations([[0, 0], [0, 1], [1, 1], [2, 1]], 3);
  const oTetromino = createRotations([[0, 0], [1, 0], [0, 1], [1, 1]], 2);
  const iTetromino = createRotations([[0, 1], [1, 1], [2, 1], [3, 1]], 4);
  const tTetromino = createRotations([[1, 0], [0, 1], [1, 1], [2, 1]], 3);
  const sTetromino = createRotations([[1, 0], [2, 0], [0, 1], [1, 1]], 3);
  const zTetromino = createRotations([[0, 0], [1, 0], [1, 1], [2, 1]], 3);
  const theTetrominoes = [lTetromino, jTetromino, oTetromino, iTetromino, tTetromino, sTetromino, zTetromino];

  // SRS kick data. Each pair is (columns right, rows UP), matching TetrisWiki.
  const standardKicks = {
    "0>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "1>0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "1>2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "2>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "2>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "3>2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "3>0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "0>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };
  const iKicks = {
    "0>1": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "1>0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "1>2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    "2>1": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "2>3": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "3>2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "3>0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "0>3": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };

  let currentPosition = { x: 3, y: 0 };
  let currentRotation = 0;
  let random = 0;
  let nextRandom = 0;
  let current = theTetrominoes[random][currentRotation];

  function rand() {
    // Mulberry32: a compact reproducible PRNG with good seed diffusion.
    randomState = (randomState + 0x6D2B79F5) >>> 0;
    let n = randomState;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }

  // Seven-bag randomizer: all seven pieces before reshuffling.
  function takePiece() {
    if (!bag.length) {
      bag = Array.from({ length: theTetrominoes.length }, (_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function getCells(type = random, rotation = currentRotation, position = currentPosition) {
    return theTetrominoes[type][rotation].map((offset) => {
      const x = position.x + offset % width;
      const y = position.y + Math.floor(offset / width);
      return { x, y, index: y * width + x };
    });
  }

  function canPlace(position, rotation = currentRotation, type = random) {
    return getCells(type, rotation, position).every(({ x, y, index }) =>
      x >= 0 && x < width && y >= 0 && y < height &&
      !squares[index].classList.contains("taken")
    );
  }

  // Draw the ghost underneath the active Tetromino.
  function draw() {
    if (experiment.enableGhost) {
      let ghostPosition = { ...currentPosition };
      while (canPlace({ ...ghostPosition, y: ghostPosition.y + 1 })) ghostPosition.y++;
      const occupied = new Set(getCells().map(({ index }) => index));
      getCells(random, currentRotation, ghostPosition).forEach(({ index }) => {
        if (!occupied.has(index)) squares[index].classList.add("ghost");
      });
    }
    getCells().forEach(({ index }) => {
      squares[index].classList.add("tetromino");
      squares[index].style.backgroundColor = colors[random];
    });
  }

  function undraw() {
    squares.forEach((square) => square.classList.remove("ghost"));
    getCells().forEach(({ index }) => {
      if (squares[index]) {
        squares[index].classList.remove("tetromino");
        squares[index].style.backgroundColor = "";
      }
    });
  }

  function elapsedMs() {
    return activeElapsedMs + (status === "running" ? performance.now() - sessionStart : 0);
  }

  function record(event, detail = "") {
    log.push({
      trial: experiment.trialId,
      seed: experiment.seed,
      timestamp_utc: new Date().toISOString(),
      gravity_ms: experiment.gravityMs,
      lock_delay_ms: experiment.lockDelayMs,
      duration_seconds: experiment.durationSeconds,
      progressive_speed: experiment.progressiveSpeed,
      pause_allowed: experiment.allowPause,
      elapsed_ms: Math.round(elapsedMs()),
      event,
      piece: pieceNames[random],
      x: currentPosition.x,
      y: currentPosition.y,
      rotation: currentRotation,
      score,
      lines,
      level,
      pieces_placed: piecesPlaced,
      detail,
    });
  }

  function updateDisplay() {
    scoreDisplay.textContent = score;
    linesDisplay.textContent = lines;
    levelDisplay.textContent = level;
    piecesDisplay.textContent = piecesPlaced;
    timeDisplay.textContent = (elapsedMs() / 1000).toFixed(1) + "s";
    statusDisplay.textContent = {
      idle: "Ready",
      running: "Playing",
      paused: "Paused",
      finished: "Game over",
    }[status];
    startBtn.textContent = { idle: "Start", running: "Pause", paused: "Resume", finished: "New game" }[status];
    startBtn.disabled = status === "running" && !experiment.allowPause;
    statusDisplay.dataset.state = status;
    statusDisplay.setAttribute("aria-label", `Game status: ${statusDisplay.textContent}`);
    const statusButton = document.querySelector(".status");
    statusButton.dataset.state = status;
  }

  function clearLockTimer() {
    if (lockTimerId !== null) clearTimeout(lockTimerId);
    lockTimerId = null;
  }

  function updateLockTimer(playerMoved = false) {
    if (canPlace({ ...currentPosition, y: currentPosition.y + 1 })) {
      clearLockTimer();
      return;
    }
    if (lockTimerId !== null && (!playerMoved || lockResets >= experiment.maxLockResets)) return;
    if (lockTimerId !== null) {
      clearLockTimer();
      lockResets++;
    }
    lockTimerId = setTimeout(() => {
      lockTimerId = null;
      if (status === "running") freeze(true);
    }, experiment.lockDelayMs);
  }

  // Fixed key-repeat timing (DAS/ARR), rather than OS-specific keyboard repeats.
  function stopRepeating(code) {
    const repeat = heldKeys.get(code);
    if (!repeat) return;
    clearTimeout(repeat.delayId);
    clearInterval(repeat.intervalId);
    heldKeys.delete(code);
  }

  function stopAllRepeating() {
    for (const code of [...heldKeys.keys()]) stopRepeating(code);
  }

  function beginRepeating(code, action) {
    if (heldKeys.has(code)) return;
    action();
    const repeat = { delayId: null, intervalId: null };
    heldKeys.set(code, repeat);
    repeat.delayId = setTimeout(() => {
      if (status !== "running") return;
      action();
      repeat.intervalId = setInterval(() => {
        if (status === "running") action();
      }, experiment.autoRepeatMs);
    }, experiment.delayedAutoShiftMs);
  }

  function control(e) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "KeyX", "KeyZ", "Space", "KeyC", "ShiftLeft", "ShiftRight", "KeyP"];
    if (keys.includes(e.code)) e.preventDefault();
    if (e.code === "KeyP" && !e.repeat && experiment.allowPause && status !== "finished" && status !== "idle") {
      toggleStartPause();
      return;
    }
    if (status !== "running") return;
    if (["ArrowLeft", "ArrowRight", "ArrowDown"].includes(e.code)) {
      if (e.repeat) return;
      // The most recently pressed horizontal direction takes precedence.
      if (e.code === "ArrowLeft") {
        stopRepeating("ArrowRight");
        beginRepeating(e.code, moveLeft);
      } else if (e.code === "ArrowRight") {
        stopRepeating("ArrowLeft");
        beginRepeating(e.code, moveRight);
      } else beginRepeating(e.code, () => moveDown(true));
      return;
    }
    if (e.repeat) return;
    if (e.code === "ArrowUp" || e.code === "KeyX") rotate(1);
    else if (e.code === "KeyZ") rotate(-1);
    else if (e.code === "Space") hardDrop();
    else if (e.code === "KeyC" || e.code === "ShiftLeft" || e.code === "ShiftRight") hold();
  }
  document.addEventListener("keydown", control);
  document.addEventListener("keyup", (e) => stopRepeating(e.code));
  window.addEventListener("blur", () => {
    stopAllRepeating();
    if (status === "running") record("focus_lost");
  });
  window.addEventListener("focus", () => {
    if (status === "running") record("focus_returned");
  });
  document.addEventListener("visibilitychange", () => {
    if (status === "running") record(document.hidden ? "tab_hidden" : "tab_visible");
  });

  // Move down once for gravity, or award soft-drop points for a manual move.
  function moveDown(softDrop = false) {
    if (status !== "running") return;
    const candidate = { ...currentPosition, y: currentPosition.y + 1 };
    if (canPlace(candidate)) {
      undraw();
      currentPosition = candidate;
      if (softDrop) score += 1;
      draw();
      if (softDrop) record("soft_drop");
      updateLockTimer();
      updateDisplay();
    } else {
      updateLockTimer();
    }
  }

  function hardDrop() {
    if (status !== "running") return;
    undraw();
    let distance = 0;
    while (canPlace({ ...currentPosition, y: currentPosition.y + 1 })) {
      currentPosition.y++;
      distance++;
    }
    score += distance * 2;
    draw();
    record("hard_drop", String(distance));
    freeze(true);
  }

  // Lock the active piece after the floor/stack is reached, or on hard drop.
  function freeze(force = false) {
    if (status !== "running") return;
    if (!force) {
      updateLockTimer();
      return;
    }
    clearLockTimer();
    undraw();
    getCells().forEach(({ index }) => {
      squares[index].classList.add("taken");
      squares[index].classList.add("tetromino");
      squares[index].style.backgroundColor = colors[random];
    });
    piecesPlaced++;
    record("piece_locked");
    addScore();
    holdUsed = false;
    spawnNext();
    updateDisplay();
  }

  function moveLeft() {
    if (status !== "running") return;
    const candidate = { ...currentPosition, x: currentPosition.x - 1 };
    if (!canPlace(candidate)) return;
    undraw();
    currentPosition = candidate;
    draw();
    updateLockTimer(true);
    record("move_left");
  }

  function moveRight() {
    if (status !== "running") return;
    const candidate = { ...currentPosition, x: currentPosition.x + 1 };
    if (!canPlace(candidate)) return;
    undraw();
    currentPosition = candidate;
    draw();
    updateLockTimer(true);
    record("move_right");
  }

  // Rotate with standard SRS kick checks. dir=1 clockwise, -1 counter-clockwise.
  function rotate(dir = 1) {
    if (status !== "running") return;
    const newRotation = (currentRotation + dir + 4) % 4;
    const kicks = random === 2 ? [[0, 0]] :
      (random === 3 ? iKicks : standardKicks)[`${currentRotation}>${newRotation}`];
    for (const [dx, dyUp] of kicks) {
      const candidate = { x: currentPosition.x + dx, y: currentPosition.y - dyUp };
      if (canPlace(candidate, newRotation)) {
        undraw();
        currentPosition = candidate;
        currentRotation = newRotation;
        current = theTetrominoes[random][currentRotation];
        draw();
        updateLockTimer(true);
        record(dir === 1 ? "rotate_cw" : "rotate_ccw");
        return;
      }
    }
  }

  // Next-piece preview, using the existing 4-by-4 mini-grid.
  const displaySquares = document.querySelectorAll(".mini-grid div");
  const holdSquares = document.querySelectorAll(".hold-grid div");
  const upNextTetrominoes = theTetrominoes.map((rotations) => rotations[0].map((offset) =>
    Math.floor(offset / width) * 4 + (offset % width)
  ));

  function paintPreview(cells, type) {
    cells.forEach((square) => {
      square.classList.remove("tetromino");
      square.style.backgroundColor = "";
    });
    if (type === null || type === undefined) return;
    upNextTetrominoes[type].forEach((index) => {
      cells[index].classList.add("tetromino");
      cells[index].style.backgroundColor = colors[type];
    });
  }

  function displayShape() {
    paintPreview(displaySquares, nextRandom);
    paintPreview(holdSquares, heldPiece);
  }

  function hold() {
    if (!experiment.enableHold || holdUsed || status !== "running") return;
    undraw();
    clearLockTimer();
    const previous = random;
    if (heldPiece === null) {
      random = nextRandom;
      nextRandom = takePiece();
    } else {
      random = heldPiece;
    }
    heldPiece = previous;
    holdUsed = true;
    currentPosition = spawnPosition(random);
    currentRotation = 0;
    current = theTetrominoes[random][currentRotation];
    lockResets = 0;
    displayShape();
    record("hold", pieceNames[heldPiece]);
    if (!canPlace(currentPosition)) gameOver("blocked_spawn");
    else {
      draw();
      updateLockTimer();
    }
  }

  function spawnPosition(type) {
    return { x: type === 2 ? 4 : 3, y: 0 };
  }

  function spawnNext() {
    random = nextRandom;
    nextRandom = takePiece();
    currentRotation = 0;
    current = theTetrominoes[random][currentRotation];
    currentPosition = spawnPosition(random);
    lockResets = 0;
    displayShape();
    if (!canPlace(currentPosition)) {
      gameOver("blocked_spawn");
      return;
    }
    draw();
    record("piece_spawned");
    updateLockTimer();
  }

  function stopTimers() {
    stopAllRepeating();
    if (timerId !== null) clearInterval(timerId);
    if (clockId !== null) clearInterval(clockId);
    timerId = null;
    clockId = null;
    clearLockTimer();
  }

  function startTimers() {
    sessionStart = performance.now();
    const gravity = experiment.progressiveSpeed
      ? Math.max(100, Math.round(experiment.gravityMs * Math.pow(0.8, level - 1)))
      : experiment.gravityMs;
    timerId = setInterval(() => moveDown(false), gravity);
    clockId = setInterval(() => {
      if (experiment.durationSeconds && elapsedMs() >= experiment.durationSeconds * 1000) {
        finishGame("time_limit");
      } else updateDisplay();
    }, 100);
    updateLockTimer();
  }

  function resetGame() {
    stopTimers();
    squares.forEach((square, index) => {
      square.classList.remove("tetromino", "ghost", "taken");
      square.style.backgroundColor = "";
      if (index >= height * width) square.classList.add("taken"); // original hidden bottom row
    });
    score = 0;
    lines = 0;
    level = 1;
    piecesPlaced = 0;
    lockResets = 0;
    heldPiece = null;
    holdUsed = false;
    activeElapsedMs = 0;
    sessionStart = 0;
    randomState = experiment.seed;
    bag = [];
    log = [];
    random = takePiece();
    nextRandom = takePiece();
    currentRotation = 0;
    currentPosition = spawnPosition(random);
    current = theTetrominoes[random][currentRotation];
    status = "idle";
    finishReason = null;
    displayShape();
    updateDisplay();
  }

  function toggleStartPause() {
    if (status === "idle" || status === "finished") {
      resetGame();
      status = "running";
      record("trial_started", `duration=${experiment.durationSeconds || "unlimited"}`);
      draw();
      record("piece_spawned");
      startTimers();
    } else if (status === "running") {
      if (!experiment.allowPause) return;
      record("paused");
      activeElapsedMs = elapsedMs();
      status = "paused";
      stopTimers();
    } else if (status === "paused") {
      status = "running";
      record("resumed");
      startTimers();
    }
    updateDisplay();
  }
  startBtn.addEventListener("click", toggleStartPause);
  resetBtn.addEventListener("click", resetGame);

  // Clear one or more rows during the same lock, then score them as one event.
  function addScore() {
    let removedLines = 0;
    for (let row = height - 1; row >= 0;) {
      const start = row * width;
      const indices = Array.from({ length: width }, (_, x) => start + x);
      if (!indices.every((index) => squares[index].classList.contains("taken"))) {
        row--;
        continue;
      }
      const squaresRemoved = squares.splice(start, width);
      squaresRemoved.forEach((square) => {
        square.classList.remove("taken", "tetromino", "ghost");
        square.style.backgroundColor = "";
      });
      squares = squaresRemoved.concat(squares);
      removedLines++;
      // Recheck the same row: rows above have just shifted down.
    }
    if (removedLines) {
      squares.forEach((cell) => grid.appendChild(cell));
      // Guideline-style base scoring, without combo / T-spin bonuses.
      score += [0, 100, 300, 500, 800][removedLines] * level;
      lines += removedLines;
      record("lines_cleared", String(removedLines));
      if (experiment.progressiveSpeed) {
        const newLevel = 1 + Math.floor(lines / 10);
        if (newLevel !== level) {
          level = newLevel;
          if (timerId !== null) clearInterval(timerId);
          timerId = setInterval(() => moveDown(false), Math.max(100,
            Math.round(experiment.gravityMs * Math.pow(0.8, level - 1))));
          record("level_up", String(level));
        }
      }
    }
  }

  function finishGame(reason) {
    if (status !== "running" && status !== "paused") return;
    record("trial_ended", reason);
    activeElapsedMs = elapsedMs();
    finishReason = reason;
    status = "finished";
    stopTimers();
    updateDisplay();
  }

  function gameOver(reason = "blocked_spawn") {
    finishGame(reason);
  }

  resetGame();
});
