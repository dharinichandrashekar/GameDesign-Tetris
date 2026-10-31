# Tetris

## Start playing

## How to play
Keep `Click to Play Tetris.html`, `01-app.js`, and `02-style.css` in the same folder. Open the HTML file in a modern browser. Enter a **Player ID**, then select **Start**. At game over, select **New game** to continue with the same ID.

## Controls

- **Left / right arrows**: Move pieces sideways
- **Down arrow**: Drop faster
- **Up arrow / X**: Rotate clockwise
- **Z**: Rotate counterclockwise
- **Space**: Instantly drop a piece
- **C / Shift**: Hold or swap pieces
- **P**: Pause or resume (when enabled)

## Logs and trial numbering
- Events and one-second snapshots are saved in browser storage where permitted.
- The **Saved trials** counter shows the number of distinct player-ID/game-number combinations.
- **Export CSV** exports all recorded trials for the current Player ID.
- The filename is `Tetris_game_log_YYYY-MM-DD_HH-mm-ss_ID.csv`.
- The optional **Export all IDs to CSV first** action in the Reset dialog creates a combined backup before deletion. It does not reset anything by itself.
- The export/reset feedback message disappears after three seconds.

## Important: Reset is destructive
**Reset game** opens a confirmation dialog. You must type `RESET` to confirm. It clears the board, Player ID, and *all* previously saved log records for *every* ID in this game's browser storage. This is permanent; export CSV backups before confirming. Closing or cancelling the dialog leaves the collected logs intact.

Use **New game** after Game over when you wish to retain the Player ID and all existing logs.

## Storage notes
Local browser storage may be deleted by browser settings, private browsing, or file-origin restrictions. Export CSV files regularly, and verify downloads exist before clearing logs. No information is sent to a server by this local game.

###
Note: Game functionality updates after 10/25/2026 were made with the help of ChatGPT.