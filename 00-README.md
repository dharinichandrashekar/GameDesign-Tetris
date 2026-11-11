TETRIS EXPERIMENT — 3 MINUTES OF ACTIVE PLAY
================================================

FILES
-----
Click to Play Tetris.html. Open this page in Chrome or Edge. Keep these three files (01-app.js, 02-style.css, and Click to Play Tetris.html  in the same folder. No Internet connection is needed.

PARTICIPANT FLOW
----------------
1. Enter a participant ID and select Start Game.
2. Play Tetris for 3 minutes of accumulated active gameplay. When Game Over
   occurs, it is displayed for 2 seconds, then a new game starts automatically
   with the same participant ID and trial timer.
3. Leaving the browser tab/window or manually pausing stops the timer.
   On returning, select Resume (it does not auto-resume).
4. At 03:00 of accumulated active gameplay, the board freezes with
   Trial over status. Further play requires resetting the active session.
5. Export CSV for the active PID, or use Reset game > Download all CSV &
   Reset for a CSV containing records from all retained PIDs.
6. Reset deletes all saved records and export metadata for the selected PID
   from IndexedDB and the localStorage fallback, then clears the PID, board
   and trial timer. Use Download all CSV & Reset to export retained records
   before deleting the selected PID's browser-stored data.

EXPORTED CSV
------------
The CSV contains the complete event stream, not only status transitions.
Every event row includes:
* Date (local)
* Timestamp (local, ISO 8601 with UTC offset)
* Event type, ID, trial, and game-within-trial identifiers
* Status and game-status cutoff
* Active trial time and Game elapsed/active time
* Score, lines, level and behavioural counters

GAME-OVER HANDLING AND GAME METRICS
-----------------------------------
* Game Over is shown for 2 seconds, then a new game starts automatically.
* The Game Over transition is excluded from active-play time.
* The same participant ID and three-minute trial clock are retained.
* A manual reset before completion is exported as "Reset manually".
* A browser refresh/close detected on the next load is exported as
  "Refreshed browser".
* Placement intervals use active game time, excluding manual pauses.
* The active timer uses performance.now() to accumulate elapsed active
  time rather than counting timer ticks. The display refreshes about every
  25 ms and shows whole seconds.

RANDOMIZED PIECE SEQUENCE
------------------------
* Each new game starts with a fresh cryptographically shuffled seven-piece bag.
* Consecutive games are prevented from having the same first three pieces.