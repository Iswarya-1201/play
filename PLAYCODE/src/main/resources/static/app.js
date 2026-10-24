const $ = id => document.getElementById(id);
let username = '', mode = 'SOLO', language = '', topic = '', questions = [], answers = {}, qIndex = 0, seconds = 1200, timer = null, warningCount = 0, matchId = '', activeChallenge = '', setupChallengeId = '', submitted = false, matchStartAt = 0, matchDeadline = 0, lastFocusLossAt = 0;
const joiningMatches = new Set();
const pages = ['loginPage', 'homePage', 'setupPage', 'multiPage', 'quizPage', 'resultPage'];
let presenceStarted = false;

function show(id) {
  pages.forEach(page => $(page).classList.toggle('hidden', page !== id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => $('toast').classList.add('hidden'), 3200);
}
async function api(url, opts = {}) {
  const response = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed. Please try again.');
  return data;
}
function enterFullscreen() {
  const element = document.documentElement;
  if (!document.fullscreenElement && element.requestFullscreen) element.requestFullscreen().catch(() => {});
}

$('loginBtn').onclick = async () => {
  try {
    username = $('username').value.trim();
    if (username.length < 2) return toast('Enter a player name with at least 2 characters.');
    await api('/login', { method: 'POST', body: JSON.stringify({ username }) });
    $('topUser').textContent = '👤 ' + username;
    $('welcomeName').textContent = username;
    show('homePage');
    loadBoard();
    startPresence();
  } catch (error) { toast(error.message); }
};
$('username').addEventListener('keydown', event => { if (event.key === 'Enter') $('loginBtn').click(); });

function startPresence() {
  if (presenceStarted) return;
  presenceStarted = true;
  const heartbeat = () => { if (username) api('/heartbeat', { method: 'POST', body: JSON.stringify({ username }) }).catch(() => {}); };
  heartbeat();
  setInterval(heartbeat, 15000);
  connectSocket();
}
function connectSocket() {
  try {
    const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/notifications');
    socket.onopen = () => socket.send(JSON.stringify({ username }));
    socket.onmessage = () => {
      if (mode === 'MULTI' && !$('multiPage').classList.contains('hidden')) {
        loadPlayers();
        loadChallenges();
      }
    };
  } catch (error) { /* Polling still keeps the page usable if WebSocket is unavailable. */ }
}

$('soloBtn').onclick = () => openSetup('SOLO');
$('multiBtn').onclick = () => {
  mode = 'MULTI';
  show('multiPage');
  loadPlayers();
  loadChallenges();
};
$('backHome').onclick = $('multiBack').onclick = () => show('homePage');

async function openSetup(nextMode) {
  mode = nextMode;
  setupChallengeId = '';
  $('setupTitle').textContent = nextMode === 'SOLO' ? 'Choose your quest' : 'Choose the challenge topic';
  $('setupHint').textContent = nextMode === 'SOLO'
    ? '20 random questions will be selected from your uploaded CSV question bank.'
    : 'Only the player who sent the challenge chooses the language and topic. Both players receive the exact same 20 questions.';
  $('startQuiz').innerHTML = nextMode === 'SOLO' ? 'Start 20-question quest <span>→</span>' : 'Start match <span>→</span>';
  show('setupPage');
  try {
    const languages = await api('/languages');
    $('languageOptions').innerHTML = '';
    languages.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice' + (index === 0 ? ' selected' : '');
      button.textContent = item;
      button.onclick = () => selectLanguage(item);
      $('languageOptions').appendChild(button);
      if (index === 0) language = item;
    });
    await loadTopics();
  } catch (error) { toast(error.message); }
}
async function selectLanguage(selectedLanguage) {
  language = selectedLanguage;
  document.querySelectorAll('.choice').forEach(button => button.classList.toggle('selected', button.textContent === selectedLanguage));
  await loadTopics();
}
async function loadTopics() {
  if (!language) return;
  try {
    const topics = await api('/topics?language=' + encodeURIComponent(language));
    $('topicSelect').innerHTML = '<option value="">Choose a concept</option>';
    topics.forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      $('topicSelect').appendChild(option);
    });
    topic = '';
  } catch (error) { toast(error.message); }
}
$('topicSelect').onchange = () => { topic = $('topicSelect').value; };

$('startQuiz').onclick = async () => {
  enterFullscreen();
  language = document.querySelector('.choice.selected')?.textContent || language;
  topic = $('topicSelect').value;
  if (!language || !topic) return toast('Choose a programming language and concept first.');
  if (mode === 'SOLO') {
    try {
      questions = await api('/solo/questions', { method: 'POST', body: JSON.stringify({ language, topic }) });
      if (!Array.isArray(questions) || questions.length === 0) return toast('No questions were found for this topic.');
      answers = {}; qIndex = 0; seconds = 1200; submitted = false; matchId = '';
      startQuizUI(false, Date.now());
    } catch (error) { toast(error.message); }
    return;
  }
  if (!setupChallengeId) return toast('Only the player who sent the challenge can choose the topic and start.');
  try {
    const result = await api('/match/start', { method: 'POST', body: JSON.stringify({ challengeId: setupChallengeId, username, language, topic }) });
    activeChallenge = setupChallengeId;
    await joinMatch(result.matchId);
  } catch (error) { toast(error.message); }
};

function startQuizUI(isMatch, startAt) {
  warningCount = 0;
  lastFocusLossAt = 0;
  show('quizPage');
  matchStartAt = isMatch ? (Number(startAt) || Date.now()) : Date.now();
  matchDeadline = matchStartAt + 20 * 60 * 1000;
  seconds = Math.max(0, Math.ceil((matchDeadline - Date.now()) / 1000));
  $('quizMode').textContent = isMatch ? '⚔ MULTIPLAYER MATCH' : '✦ SOLO QUEST';
  $('quizHeading').textContent = topic + ' Challenge';
  $('quizTopic').textContent = language.toUpperCase() + ' • ' + topic.toUpperCase();
  $('matchStatus').textContent = isMatch
    ? (Date.now() < matchStartAt ? 'Both players are connected. The quiz starts together shortly.' : 'Both players are playing the same questions.')
    : 'Solo quest — trust your skills and do your best!';
  renderQuestion();
  clearInterval(timer);
  timer = setInterval(() => {
    const now = Date.now();
    if (isMatch && now < matchStartAt) {
      const remaining = Math.ceil((matchStartAt - now) / 1000);
      $('timer').textContent = '00:' + String(remaining).padStart(2, '0');
      $('quizMode').textContent = '⚔ MATCH STARTS IN ' + remaining;
      document.querySelectorAll('.answer-option').forEach(button => button.disabled = true);
      return;
    }
    const remaining = Math.max(0, Math.ceil((matchDeadline - now) / 1000));
    seconds = remaining;
    $('timer').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    $('quizMode').textContent = isMatch ? '⚔ MULTIPLAYER MATCH' : '✦ SOLO QUEST';
    document.querySelectorAll('.answer-option').forEach(button => button.disabled = submitted);
    if (remaining <= 0) { clearInterval(timer); finishQuiz(true); }
  }, 250);
  if (isMatch) pollMatchState();
}

function renderQuestion() {
  const question = questions[qIndex];
  if (!question) return;
  $('questionCounter').textContent = 'QUESTION ' + (qIndex + 1) + ' OF ' + questions.length;
  $('progressBar').style.width = ((qIndex + 1) / questions.length * 100) + '%';
  $('questionText').textContent = question.question;
  $('answerOptions').innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach(letter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer-option' + (answers[String(question.id)] === letter ? ' selected' : '');
    const letterBox = document.createElement('span');
    letterBox.className = 'letter';
    letterBox.textContent = letter;
    const optionText = document.createElement('span');
    optionText.textContent = question['option' + letter] ?? '';
    button.append(letterBox, optionText);
    button.disabled = submitted || (mode === 'MULTI' && Date.now() < matchStartAt);
    button.onclick = () => {
      if (submitted) return;
      if (mode === 'MULTI' && Date.now() < matchStartAt) return toast('Wait for both players to start.');
      answers[String(question.id)] = letter;
      renderQuestion();
    };
    $('answerOptions').appendChild(button);
  });
  $('prevQuestion').disabled = qIndex === 0 || submitted;
  $('nextQuestion').disabled = submitted;
  $('nextQuestion').innerHTML = qIndex === questions.length - 1 ? 'Submit quest <span>✓</span>' : 'Next question <span>→</span>';
}
$('prevQuestion').onclick = () => { if (qIndex > 0 && !submitted) { qIndex--; renderQuestion(); } };
$('nextQuestion').onclick = () => {
  if (mode === 'MULTI' && Date.now() < matchStartAt) return toast('The match has not started yet.');
  if (qIndex < questions.length - 1) { qIndex++; renderQuestion(); }
  else if (confirm('Submit your answers now? Unanswered questions count as 0.')) finishQuiz(false);
};

async function finishQuiz(autoSubmit) {
  if (submitted) return;
  if (mode === 'MULTI' && Date.now() < matchStartAt) return toast('Wait until the synchronized start.');
  submitted = true;
  clearInterval(timer);
  renderQuestion();
  if (autoSubmit) toast('Time ended. Submitting your answers…');
  try {
    if (mode === 'SOLO') {
      const result = await api('/solo/submit', { method: 'POST', body: JSON.stringify({ username, language, topic, questions, answers }) });
      showResult(result.score, result.total, 'Quest complete!', null);
    } else {
      const result = await api('/match/' + matchId + '/submit', { method: 'POST', body: JSON.stringify({ username, answers }) });
      showResult(result.score, result.total, 'Answers locked in!', null);
      $('resultMessage').textContent = 'Your answers are submitted. Waiting for your opponent to finish…';
      $('matchStatus').textContent = 'Your answers are submitted. Waiting for your opponent to finish…';
      pollMatchResult();
    }
  } catch (error) {
    submitted = false;
    toast(error.message);
  }
}
function showResult(score, total, title, extra) {
  show('resultPage');
  $('resultTitle').textContent = title;
  $('resultScore').textContent = score;
  $('resultMessage').textContent = 'You scored ' + score + ' out of ' + total + '. Your score has been added to the leaderboard.';
  $('matchResults').innerHTML = extra || '';
  loadBoard();
}
$('homeBtn').onclick = () => { clearInterval(timer); matchId = ''; show('homePage'); loadBoard(); };
$('againBtn').onclick = () => { clearInterval(timer); openSetup('SOLO'); };
$('refreshBoard').onclick = loadBoard;

async function loadBoard() {
  try {
    const data = await api('/leaderboard');
    $('leaderboard').innerHTML = data.length
      ? data.slice(0, 10).map((item, index) => `<div class="board-row"><span class="rank">${index + 1}</span><b>${esc(item.username)}</b><span>${esc(item.topic)}</span><span class="points">${item.score}/${item.total}</span></div>`).join('')
      : '<p class="tiny">No scores yet. Be the first to enter the hall of fame!</p>';
  } catch (error) { $('leaderboard').textContent = 'Leaderboard will appear when the server is available.'; }
}
async function loadPlayers() {
  try {
    const players = await api('/online?username=' + encodeURIComponent(username));
    $('playersList').innerHTML = players.length
      ? players.map(player => `<div class="player-row"><div><div class="player-name">🟢 ${esc(player)}</div><small>Online now · Ready to play</small></div><button class="primary" data-player="${esc(player)}">Challenge ↗</button></div>`).join('')
      : '<p class="tiny">No other players are online yet. Open PLAYVERSE in another browser or device with a different username.</p>';
    document.querySelectorAll('[data-player]').forEach(button => button.onclick = () => sendChallenge(button.dataset.player));
  } catch (error) { toast(error.message); }
}
async function sendChallenge(to) {
  try {
    await api('/challenge', { method: 'POST', body: JSON.stringify({ from: username, to }) });
    toast('Challenge sent to ' + to + '!');
    loadChallenges();
  } catch (error) { toast(error.message); }
}
async function loadChallenges() {
  try {
    const list = await api('/challenges?username=' + encodeURIComponent(username));
    $('challengeList').innerHTML = list.length ? list.map(challenge => {
      const incoming = challenge.to.toLowerCase() === username.toLowerCase();
      const outgoing = challenge.from.toLowerCase() === username.toLowerCase();
      const pending = challenge.status === 'PENDING';
      let actions = '';
      let status = 'Status: ' + challenge.status;
      if (pending && incoming) actions = `<button class="primary" data-accept="${esc(challenge.id)}">Accept</button><button class="light" data-reject="${esc(challenge.id)}">Decline</button>`;
      else if (pending && outgoing) status = 'Waiting for ' + esc(challenge.to) + ' to accept…';
      else if (challenge.status === 'ACCEPTED' && !challenge.matchId && outgoing) actions = `<button class="primary" data-play="${esc(challenge.id)}">Choose topic & start ↗</button>`;
      else if (challenge.status === 'ACCEPTED' && !challenge.matchId && incoming) status = 'Accepted. Waiting for ' + esc(challenge.from) + ' to choose the topic…';
      else if (challenge.matchId) status = 'Match: ' + esc(challenge.language || '') + ' / ' + esc(challenge.topic || '') + ' — ' + (outgoing ? 'your quiz is starting' : 'the inviter selected the quiz');
      return `<div class="challenge-row"><div><b>${incoming ? 'From ' + esc(challenge.from) : 'To ' + esc(challenge.to)}</b><div class="tiny">${status}</div></div><div class="challenge-actions">${actions}</div></div>`;
    }).join('') : '<p class="tiny">No challenges yet. Find a player and send your first invite.</p>';
    document.querySelectorAll('[data-accept]').forEach(button => button.onclick = () => respondChallenge(button.dataset.accept, 'ACCEPT'));
    document.querySelectorAll('[data-reject]').forEach(button => button.onclick = () => respondChallenge(button.dataset.reject, 'REJECT'));
    document.querySelectorAll('[data-play]').forEach(button => button.onclick = () => startChallengeSetup(button.dataset.play));
    list.forEach(challenge => {
      if (challenge.to.toLowerCase() === username.toLowerCase() && challenge.status === 'ACCEPTED' && challenge.matchId) {
        joinMatch(challenge.matchId).catch(error => toast(error.message));
      }
    });
  } catch (error) { toast(error.message); }
}
async function respondChallenge(id, response) {
  if (response === 'ACCEPT') enterFullscreen();
  try {
    const result = await api('/challenge/respond', { method: 'POST', body: JSON.stringify({ id, username, response }) });
    toast('Challenge ' + String(result.status || response).toLowerCase() + '!');
    loadChallenges();
  } catch (error) { toast(error.message); }
}
async function startChallengeSetup(id) {
  setupChallengeId = id;
  await openSetup('MULTI');
  setupChallengeId = id;
  $('setupTitle').textContent = 'Choose the quiz for both players';
  $('setupHint').textContent = 'You sent this challenge, so you choose the language and concept. Your opponent receives these exact questions automatically.';
  $('startQuiz').innerHTML = 'Start match for both players <span>→</span>';
}
async function joinMatch(id) {
  if (joiningMatches.has(id) || matchId === id) return;
  joiningMatches.add(id);
  try {
    const match = await api('/match/' + id + '?username=' + encodeURIComponent(username));
    matchId = match.matchId;
    activeChallenge = id;
    language = match.language;
    topic = match.topic;
    questions = match.questions || [];
    if (!questions.length) throw new Error('The shared questions are not ready yet. Refresh the challenge list.');
    answers = {}; qIndex = 0; submitted = false; warningCount = 0;
    startQuizUI(true, match.startAt);
    toast(Date.now() < Number(match.startAt) ? 'Same quiz received. Both players start together!' : 'Joined the same quiz as your opponent.');
  } catch (error) {
    joiningMatches.delete(id);
    throw error;
  }
}
async function pollMatchState() {
  const id = matchId;
  if (!id) return;
  try {
    const match = await api('/match/' + id + '?username=' + encodeURIComponent(username));
    if (match.status === 'FINISHED') { showFinalMatch(match); return; }
    const other = username.toLowerCase() === match.player1.toLowerCase() ? match.player2 : match.player1;
    const otherSubmitted = Array.isArray(match.submitted) && match.submitted.some(player => String(player).toLowerCase() === other.toLowerCase());
    if ($('matchStatus') && !submitted) {
      $('matchStatus').textContent = otherSubmitted ? other + ' has submitted their answers. Finish yours!' : (match.status === 'COUNTDOWN' ? 'Both players are connected. Starting together…' : 'You and ' + other + ' are answering the same quiz.');
    }
  } catch (error) { /* The next poll retries. */ }
  if (matchId === id && !submitted) setTimeout(pollMatchState, 1500);
}
function pollMatchResult() {
  const id = matchId;
  const poll = async () => {
    try {
      const match = await api('/match/' + id + '?username=' + encodeURIComponent(username));
      if (match.status === 'FINISHED') { showFinalMatch(match); return; }
    } catch (error) { /* The next poll retries. */ }
    if (matchId === id) setTimeout(poll, 1500);
  };
  setTimeout(poll, 1200);
}
function showFinalMatch(match) {
  clearInterval(timer);
  const myScore = Number(match.scores?.[username] ?? 0);
  const opponent = username.toLowerCase() === match.player1.toLowerCase() ? match.player2 : match.player1;
  const opponentScore = Number(match.scores?.[opponent] ?? 0);
  const title = myScore === opponentScore ? '🤝 It’s a tie!' : myScore > opponentScore ? '🏆 Victory is yours!' : 'Good game, challenger!';
  const extra = `<div class="result-line">${esc(match.player1)}: <b>${match.scores?.[match.player1] ?? 0}/20</b></div><div class="result-line">${esc(match.player2)}: <b>${match.scores?.[match.player2] ?? 0}/20</b></div><p class="tiny">Same questions · ${esc(match.language)} · ${esc(match.topic)}</p>`;
  showResult(myScore, 20, title, extra);
}
$('refreshPlayers').onclick = loadPlayers;
$('refreshChallenges').onclick = loadChallenges;
$('fullscreenBtn')?.addEventListener('click', enterFullscreen);
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
// Browsers cannot fully block OS/app switching. Warn on focus loss and submit after repeated leaving.
function recordFocusLoss() {
  if ($('quizPage').classList.contains('hidden') || submitted) return;
  const now = Date.now();
  if (now - lastFocusLossAt < 1400) return;
  lastFocusLossAt = now;
  warningCount++;
  if (warningCount === 1) toast('Focus warning: return to your quest. Leaving is recorded.');
  else {
    toast('You left the quiz again. Your answers are being submitted.');
    finishQuiz(true);
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) recordFocusLoss(); });
window.addEventListener('blur', recordFocusLoss);
setInterval(() => { if (username && mode === 'MULTI' && !$('multiPage').classList.contains('hidden')) loadPlayers(); }, 6000);
setInterval(() => { if (username && mode === 'MULTI' && !$('multiPage').classList.contains('hidden')) loadChallenges(); }, 1800);
