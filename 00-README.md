# Tetris

## Start playing

Open "Click to Play Tetris.html" in a browser. Keep 01-app.js and 02-style.css in the same folder as the HTML file. No installation or internet connection is required.

Press **Start** to play. The game status shows **Ready**, **Playing**, **Paused**, or **Game over**. Press **Reset game** at any time to reset the game and return to **Ready**. Press **Start** again for a new game.

## Controls

- **Left / right arrows**: Move pieces sideways
- **Down arrow**: Drop faster
- **Up arrow / X**: Rotate clockwise
- **Z**: Rotate counterclockwise
- **Space**: Instantly drop a piece
- **C / Shift**: Hold or swap pieces
- **P**: Pause or resume (when enabled)


## EXPORT GAME LOG (CSV)
- Click "Export game log (CSV)" after starting at least one game.
- The downloaded CSV has one row per event and one snapshot per playing second.
- Events: ready, started, snapshot, paused, resumed, reset, hard_drop, hold,
  piece_locked, lines_cleared, level_up, game_over and log_exported.
- Fields: game number, UTC timestamp, event, status, elapsed MM:SS, elapsed
  seconds, score, cleared lines, level, pieces placed, current/next/held
  tetromino, and event details.
- The log includes earlier games after you reset, as long as this page stays
  open. The history is stored only in browser memory, and is cleared on reload
  or when the tab closes. Export before leaving the page to keep it.
- No trial IDs, experiment-specific fields, tracking endpoints, or URL
  configuration are included.


  ###
  Note: Game functionality updates after 10/25/2026 were made with the help of ChatGPT.