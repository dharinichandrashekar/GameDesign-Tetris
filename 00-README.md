TETRIS EXPERIMENT (ACTIVE PLAYTIME = 7 minutes)
================================================

FILES
-----
Click to Play Tetris.html. Open this page in Chrome or Edge. Keep these three files (01-app.js, 02-style.css, and Click to Play Tetris.html  in the same folder. No Internet connection is needed.

PARTICIPANT FLOW
----------------
1. Enter a participant ID and select Start Game.
2. Play Tetris. When Game Over occurs, the active-play timer
   automatically pauses. Select New Game to resume the SAME timer and PID.
3. Leaving the browser tab/window or manually pausing stops the timer.
   On returning, select Resume (it does not auto-resume).
4. At 07:00 of accumulated active gameplay, the board freezes with
   Trial over status. Further play requires resetting the active session.
5. Export CSV for the active PID, or use Reset game > Download all CSV &
   Reset for a CSV containing records from all retained PIDs.
6. Reset clears the PID, board, and trial timer, but retains historical
   records in browser storage.

EXPORTED CSV: EXACTLY 12 COLUMNS (IN ORDER)
-------------------------------------------
1. ID
2. Trial
3. Game
4. Game within trial
5. Status
6. Game status cutoff
7. Trial Time (active trial in minutes)
8. Time (active trial in seconds)
9. Score
10. Lines
11. Level
12. Number of pieces placed

COLUMN INTERPRETATION
---------------------
* Trial: numbered trial for a given participant, starting at 1.
* Game: sequential game number for that PID across all its trials.
* Game within trial: 1, 2, 3 ... and resets when a new trial begins.
* Status: Playing, Paused, Game over, or Trial over. There is one
  exported row per meaningful status transition (start, resume, pause,
  game over, and final trial cutoff). Routine actions, one-second
  snapshots, and internal export/recovery events are NOT exported.
* Game status cutoff: Game over on an individual game's Game over row;
  Playing on the Trial over row when the seven-minute cutoff interrupts
  an active game. Blank for nonterminal status-transition rows. Because
  the clock pauses at Game over, a completed trial normally has Playing
  as its final game status cutoff.
* Trial Time (active trial in minutes): decimal MINUTES, to 3 places.
  For example, 01:30 is 1.500 minutes; 07:00 is 7.000 minutes.
* Time (active trial in seconds): decimal SECONDS, to 2 places.
  For example, 01:30 is 90.00 seconds; 07:00 is 420.00 seconds.
* Score, Lines, Level, Number of pieces placed: current GAME's values
  at that transition, NOT totals over all games. The board and these
  counters reset on New game.
