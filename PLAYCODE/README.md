# PLAYCODE — Java/Python quiz and multiplayer challenge

## Included
- Spring Boot (Java 17), HTML, CSS, JavaScript, REST API, WebSocket endpoint, MySQL/JPA.
- CSV question bank imported from the supplied `1000_Java_Python_Questions.csv`.
- Username demo login, language/topic selection, 20 random questions, scoring, history/leaderboard.
- Online presence, challenge requests, accept/reject, same-question multiplayer match, scores and winner. The challenge sender alone selects the language/topic; the invited player automatically receives the same 20 questions.
- A shared server-side start timestamp gives both players a short synchronized countdown. The UI displays match status and opponent submission status.
- Full-screen request plus focus-loss detection, warning and automatic submission after repeated tab switching.

## Important honesty/security notes
- A normal browser application cannot completely prevent Alt+Tab, OS app switching, a second device, browser developer tools, or all ways to leave a page. This project detects tab hiding/window blur and auto-submits after repeated focus loss, but it is not a secure proctoring system.
- Login is a demo username-only login, not production authentication. Add password hashing, sessions/JWT, rate limiting and HTTPS before real public deployment.
- The multiplayer match uses the same 20 questions when both players start the same challenge. The match start is coordinated by the server timestamp and REST polling. The invited player does not choose a topic or a separate question set.
- This is a runnable starter package, not a production-hardened public service.

## Requirements
1. JDK 17 or newer.
2. Maven 3.9+.
3. MySQL 8+.

## Run on Windows
1. Extract `PLAYCODE.zip`.
2. Install/start MySQL. Create a database if desired:
   ```sql
   CREATE DATABASE playcode;
   ```
3. Open `src/main/resources/application.properties`. Set `spring.datasource.username` and `spring.datasource.password` to your MySQL credentials. Or set environment variables `DB_USER` and `DB_PASSWORD`.
4. Copy your CSV to `src/main/resources/questions.csv` (this ZIP already includes it).
5. Open Command Prompt in the extracted `PLAYCODE` folder and run:
   ```bat
   mvn spring-boot:run
   ```
6. Open `http://localhost:8080`.
7. For a multiplayer test, open the same URL in two separate browsers (or an incognito window), log in with two different usernames, keep both open, then send/accept a challenge. The sender chooses Java/Python and a topic, clicks **Start match for both players**, and the invited player automatically joins the same questions after the synchronized countdown. A deployed server is required for players on different devices/networks.

## How it works
- The CSV loads when Spring Boot starts; the console prints the number of loaded questions.
- `/api/languages` and `/api/topics` populate the UI from real CSV values.
- The browser requests 20 random questions for a selected language/topic.
- The backend grades submitted answers against the CSV and writes scores into `quiz_scores` in MySQL.
- The online list uses heartbeat requests; challenges and matches are stored in concurrent in-memory maps; scores persist in MySQL.
- Since challenge/match state is in memory, restarting the server clears current online players and active matches, but not saved scores.

## API endpoints
- `POST /api/login`
- `GET /api/languages`, `GET /api/topics?language=Java`
- `POST /api/solo/questions`, `POST /api/solo/submit`
- `GET /api/online?username=...`
- `POST /api/challenge`, `GET /api/challenges?username=...`, `POST /api/challenge/respond`
- `POST /api/match/start`, `GET /api/match/{id}?username=...`, `POST /api/match/{id}/submit`
- `GET /api/leaderboard`, `GET /api/history?username=...`
- WebSocket endpoint: `/ws/notifications`
