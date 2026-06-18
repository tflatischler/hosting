/* ============================================
   LYRIK-SCHLACHT – Game Logic (PeerJS P2P)
   ============================================ */

// ---- Constants ----
const BOARD_SIZE = 10;
const SHIPS = [
  { name: 'Schlachtschiff', size: 5 },
  { name: 'Kreuzer', size: 4 },
  { name: 'Zerstörer', size: 3 },
  { name: 'U-Boot', size: 3 },
  { name: 'Beiboot', size: 2 },
];
const TOTAL_SHIP_CELLS = SHIPS.reduce((s, sh) => s + sh.size, 0);
const COLS = 'ABCDEFGHIJ'.split('');

// ---- Face on Hit ----
// Legt hier den Pfad zu eurem ausgeschnittenen Gesichts-PNG ab:
const FACE_IMG_SRC = 'img/face.png';

function addFaceToCell(cell) {
  if (!cell || cell.querySelector('.face-hit')) return;
  cell.classList.add('has-face');
  const img = document.createElement('img');
  img.className = 'face-hit';
  img.alt = 'Treffer!';
  img.draggable = false;
  // Faellt das Bild aus (Ladefehler), wieder auf das X-Trefferzeichen zurueck.
  img.addEventListener('error', () => {
    cell.classList.remove('has-face');
    img.remove();
  });
  img.src = FACE_IMG_SRC;
  cell.appendChild(img);
}

// ---- State ----
let peer = null;
let conn = null;
let isHost = false;
let myBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
let enemyBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
let myShips = []; // [{cells: [[r,c],...], sunk: false}]
let placementShipIndex = 0;
let placementHorizontal = true;
let myTurn = false;
let myScore = TOTAL_SHIP_CELLS;
let oppScore = TOTAL_SHIP_CELLS;
let opponentReady = false;
let meReady = false;
let gameActive = false;
let questions = [];
let usedQuestions = new Set();
let pendingShotR = -1;
let pendingShotC = -1;

// ---- Keepalive / Heartbeat ----
const HEARTBEAT_INTERVAL = 5000;   // alle 5s ein Ping senden (hält NAT-Mapping offen)
const HEARTBEAT_TIMEOUT = 20000;   // 20s ohne Lebenszeichen => Verbindung gilt als tot
let heartbeatTimer = null;
let lastSeen = 0;
let intentionalClose = false;

// ---- Zuverlaessige Zustellung (ACK + Retransmit) ----
// Zugkritische Nachrichten duerfen NICHT verloren gehen, sonst denken beide Spieler,
// der andere sei am Zug (Deadlock). Diese Typen werden quittiert und solange erneut
// gesendet, bis ein ACK zurueckkommt – auch ueber kurze Verbindungsaussetzer hinweg.
const RELIABLE_TYPES = new Set(['ready', 'shot', 'shot-result', 'quiz-answer', 'game-over']);
const RETRANSMIT_INTERVAL = 1500; // ms zwischen Wiederholungen
let msgSeqCounter = 0;
const pendingAcks = new Map(); // seqId -> { data, tries }
const seenSeqs = new Set();     // bereits verarbeitete seqIds (Dedupe)
let retransmitTimer = null;

// ---- Selbstheilung gegen Zug-Deadlock ----
// Trotz zuverlaessiger Zustellung kann der Zug-Zustand entgleisen (z.B. ein Schuss,
// der waehrend eines laengeren Ausfalls verloren geht). Dann denken BEIDE Spieler, der
// andere sei dran. Wir tauschen den Zug-Zustand ueber den Heartbeat aus und loesen einen
// anhaltenden Beide-warten-Zustand deterministisch auf (der Host uebernimmt den Zug).
const DEADLOCK_TIMEOUT = 9000; // ms bestaetigtes Beide-untaetig, bevor aufgeloest wird
let peerIdle = false;          // letzter bekannter Zustand des Gegners: nicht am Zug
let peerBusy = false;          // Gegner beantwortet gerade ein Quiz (legitimes Warten)
let deadlockSince = 0;

// ---- DOM refs ----
const $ = id => document.getElementById(id);

// ---- Init ----
window.addEventListener('DOMContentLoaded', async () => {
  await loadQuestions();
  setupStartScreen();
});

// ---- Questions ----
async function loadQuestions() {
  try {
    const resp = await fetch('js/questions.json');
    questions = await resp.json();
  } catch (e) {
    console.error('Fragen konnten nicht geladen werden:', e);
    questions = [];
  }
}

function getRandomQuestion() {
  const available = questions.filter((_, i) => !usedQuestions.has(i));
  if (available.length === 0) {
    usedQuestions.clear();
    return getRandomQuestion();
  }
  const pool = questions.map((q, i) => ({ q, i })).filter(x => !usedQuestions.has(x.i));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  usedQuestions.add(pick.i);
  return { ...pick.q, _index: pick.i };
}

// ---- Peer Setup ----
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function setupStartScreen() {
  $('btn-create').addEventListener('click', createGame);
  $('btn-join').addEventListener('click', joinGame);
}

function createGame() {
  const code = generateCode();
  $('btn-create').classList.add('hidden');
  document.querySelector('.join-group').classList.add('hidden');
  document.querySelector('.divider').classList.add('hidden');
  $('waiting-area').classList.remove('hidden');
  $('game-code').textContent = code;
  isHost = true;

  peer = new Peer('lyrik-' + code, {
    debug: 0,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });

  peer.on('open', () => {
    console.log('Host bereit, warte auf Gegner…');
  });

  peer.on('connection', c => {
    conn = c;
    setupConnection();
  });

  peer.on('error', err => {
    console.error('Peer error:', err);
    showError('Verbindungsfehler: ' + err.type);
  });

  setupPeerReconnect();
}

function joinGame() {
  const input = $('input-join-id').value.trim().toUpperCase();
  if (!input) return;

  peer = new Peer(undefined, {
    debug: 0,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });

  peer.on('open', () => {
    conn = peer.connect('lyrik-' + input, { reliable: true });
    conn.on('open', () => setupConnection());
    conn.on('error', err => showError('Konnte nicht beitreten: ' + err));
  });

  peer.on('error', err => {
    console.error('Peer error:', err);
    showError('Verbindungsfehler. Ist der Code korrekt?');
  });

  setupPeerReconnect();
}

// Wenn die Verbindung zum PeerJS-Broker-Server abreisst, automatisch neu verbinden.
// Verhindert, dass Spieler nach einer Weile "gekickt" werden.
function setupPeerReconnect() {
  peer.on('disconnected', () => {
    if (intentionalClose) return;
    console.warn('Verbindung zum Signaling-Server verloren – versuche Reconnect…');
    try {
      peer.reconnect();
    } catch (e) {
      console.error('Reconnect fehlgeschlagen:', e);
    }
  });
}

function showError(msg) {
  $('connection-error').textContent = msg;
  $('connection-error').classList.remove('hidden');
}

function setupConnection() {
  console.log('Verbunden!');
  conn.on('data', handleMessage);
  conn.on('close', () => {
    stopHeartbeat();
    if (gameActive && !intentionalClose) {
      showGameOver('Verbindung verloren', 'Dein Gegner hat das Spiel verlassen.');
    }
  });
  startHeartbeat();
  showScreen('screen-placement');
  buildPlacementBoard();
  buildShipList();
}

function send(data) {
  // Zugkritische Typen zuverlaessig (mit Quittung) senden, der Rest feuern-und-vergessen.
  if (RELIABLE_TYPES.has(data.type)) {
    const seq = (isHost ? 'H' : 'J') + (++msgSeqCounter);
    data._seq = seq;
    pendingAcks.set(seq, { data, tries: 0 });
    rawSend(data);
    startRetransmit();
  } else {
    rawSend(data);
  }
}

function rawSend(data) {
  if (conn && conn.open) {
    try { conn.send(data); } catch (e) { /* offline – Retransmit holt es nach */ }
  }
}

// Wiederholt unquittierte Nachrichten, bis ein ACK eintrifft.
function startRetransmit() {
  if (retransmitTimer) return;
  retransmitTimer = setInterval(() => {
    if (pendingAcks.size === 0) { stopRetransmit(); return; }
    if (!conn || !conn.open) return; // warten bis Verbindung wieder steht
    for (const entry of pendingAcks.values()) {
      entry.tries++;
      rawSend(entry.data);
    }
  }, RETRANSMIT_INTERVAL);
}

function stopRetransmit() {
  if (retransmitTimer) {
    clearInterval(retransmitTimer);
    retransmitTimer = null;
  }
}

// ---- Heartbeat ----
// Sendet regelmaessig einen Ping ueber den DataChannel. Das haelt das NAT-/Firewall-
// Mapping offen (UDP-Verbindungen werden sonst nach ~30s Inaktivitaet geschlossen) und
// erkennt tote Verbindungen, ohne auf das traege WebRTC-close-Event angewiesen zu sein.
function startHeartbeat() {
  stopHeartbeat();
  lastSeen = Date.now();
  heartbeatTimer = setInterval(() => {
    if (!conn || !conn.open) return;
    send({ type: 'ping', t: Date.now(), idle: !myTurn, busy: isQuizOpen() });
    checkTurnDeadlock();
    if (Date.now() - lastSeen > HEARTBEAT_TIMEOUT) {
      console.warn('Keine Antwort vom Gegner – Verbindung gilt als tot.');
      stopHeartbeat();
      if (gameActive && !intentionalClose) {
        showGameOver('Verbindung verloren', 'Keine Verbindung mehr zum Gegner.');
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function isQuizOpen() {
  const q = $('quiz-overlay');
  return !!q && !q.classList.contains('hidden');
}

// Erkennt einen anhaltenden Zustand, in dem BEIDE Spieler "Gegner ist dran" anzeigen,
// und loest ihn auf. Ein Quiz (legitimes Warten auf eine Antwort) wird ausgenommen.
// Die Aufloesung ist deterministisch identisch auf beiden Seiten: der Host bekommt den
// Zug. So wird garantiert genau ein Spieler aktiv – kein dauerhafter Deadlock.
function checkTurnDeadlock() {
  if (!gameActive || intentionalClose) { deadlockSince = 0; return; }
  const stuck = !myTurn && peerIdle && !isQuizOpen() && !peerBusy;
  if (!stuck) { deadlockSince = 0; return; }
  if (!deadlockSince) { deadlockSince = Date.now(); return; }
  if (Date.now() - deadlockSince > DEADLOCK_TIMEOUT) {
    deadlockSince = 0;
    myTurn = isHost; // deterministisch: Host uebernimmt
    updateTurnIndicator();
    console.warn('Zug-Deadlock erkannt – automatisch aufgeloest (Host am Zug).');
  }
}

// ---- Screens ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ---- Placement ----
function buildPlacementBoard() {
  const board = $('placement-board');
  board.innerHTML = '';
  // Corner
  board.appendChild(createLabel(''));
  // Column headers
  for (let c = 0; c < BOARD_SIZE; c++) board.appendChild(createLabel(COLS[c]));
  // Rows
  for (let r = 0; r < BOARD_SIZE; r++) {
    board.appendChild(createLabel(String(r + 1)));
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('click', () => placeShipAt(r, c));
      cell.addEventListener('mouseenter', () => previewShip(r, c));
      cell.addEventListener('mouseleave', clearPreview);
      board.appendChild(cell);
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') toggleRotation();
  });
  $('btn-rotate').addEventListener('click', toggleRotation);
}

function createLabel(text) {
  const el = document.createElement('div');
  el.className = 'cell-label';
  el.textContent = text;
  return el;
}

function buildShipList() {
  const list = $('ship-list');
  list.innerHTML = '<div style="font-size:0.85rem;font-weight:600;margin-bottom:0.3rem">Schiffe</div>';
  SHIPS.forEach((ship, i) => {
    const item = document.createElement('div');
    item.className = 'ship-item' + (i === 0 ? ' selected' : '');
    item.id = 'ship-item-' + i;
    const cells = document.createElement('div');
    cells.className = 'ship-cells';
    for (let s = 0; s < ship.size; s++) {
      const c = document.createElement('div');
      c.className = 'ship-cell-preview';
      cells.appendChild(c);
    }
    const name = document.createElement('span');
    name.className = 'ship-name';
    name.textContent = `${ship.name} (${ship.size})`;
    item.appendChild(cells);
    item.appendChild(name);
    list.appendChild(item);
  });
}

function toggleRotation() {
  placementHorizontal = !placementHorizontal;
  $('btn-rotate').textContent = placementHorizontal ? 'Drehen (R)' : 'Drehen (R) ↕';
}

function getShipCells(r, c, size, horizontal) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const cr = horizontal ? r : r + i;
    const cc = horizontal ? c + i : c;
    cells.push([cr, cc]);
  }
  return cells;
}

function canPlace(cells) {
  for (const [r, c] of cells) {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (myBoard[r][c] !== 0) return false;
  }
  return true;
}

function previewShip(r, c) {
  if (placementShipIndex >= SHIPS.length) return;
  clearPreview();
  const ship = SHIPS[placementShipIndex];
  const cells = getShipCells(r, c, ship.size, placementHorizontal);
  const valid = canPlace(cells);
  for (const [cr, cc] of cells) {
    if (cr < 0 || cr >= BOARD_SIZE || cc < 0 || cc >= BOARD_SIZE) continue;
    const el = getPlacementCell(cr, cc);
    if (el) el.classList.add(valid ? 'ship-preview' : 'ship-preview-invalid');
  }
}

function clearPreview() {
  document.querySelectorAll('.ship-preview, .ship-preview-invalid').forEach(el => {
    el.classList.remove('ship-preview', 'ship-preview-invalid');
  });
}

function getPlacementCell(r, c) {
  return $('placement-board').querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function placeShipAt(r, c) {
  if (placementShipIndex >= SHIPS.length) return;
  const ship = SHIPS[placementShipIndex];
  const cells = getShipCells(r, c, ship.size, placementHorizontal);
  if (!canPlace(cells)) return;

  for (const [cr, cc] of cells) {
    myBoard[cr][cc] = 1;
    const el = getPlacementCell(cr, cc);
    if (el) { el.classList.add('ship'); el.classList.remove('ship-preview'); }
  }
  myShips.push({ cells, sunk: false, hitsLeft: ship.size });

  const item = $('ship-item-' + placementShipIndex);
  if (item) { item.classList.remove('selected'); item.classList.add('placed'); }

  placementShipIndex++;
  if (placementShipIndex < SHIPS.length) {
    const next = $('ship-item-' + placementShipIndex);
    if (next) next.classList.add('selected');
  } else {
    $('btn-ready').classList.remove('hidden');
    $('btn-ready').addEventListener('click', playerReady);
  }
}

function playerReady() {
  meReady = true;
  $('btn-ready').classList.add('hidden');
  $('waiting-opponent').classList.remove('hidden');
  send({ type: 'ready' });
  if (opponentReady) startGame();
}

// ---- Game ----
function startGame() {
  gameActive = true;
  myScore = TOTAL_SHIP_CELLS;
  oppScore = TOTAL_SHIP_CELLS;
  myTurn = isHost;

  showScreen('screen-game');
  buildGameBoard('board-enemy', true);
  buildGameBoard('board-own', false);
  updateScores();
  updateTurnIndicator();
}

function buildGameBoard(id, isEnemy) {
  const board = $(id);
  board.innerHTML = '';
  board.appendChild(createLabel(''));
  for (let c = 0; c < BOARD_SIZE; c++) board.appendChild(createLabel(COLS[c]));
  for (let r = 0; r < BOARD_SIZE; r++) {
    board.appendChild(createLabel(String(r + 1)));
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (isEnemy) {
        cell.addEventListener('click', () => shoot(r, c));
      } else {
        if (myBoard[r][c] === 1) cell.classList.add('ship');
      }
      board.appendChild(cell);
    }
  }
}

function getEnemyCell(r, c) {
  return $('board-enemy').querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function getOwnCell(r, c) {
  return $('board-own').querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function shoot(r, c) {
  if (!myTurn || !gameActive) return;
  if (enemyBoard[r][c] !== 0) return; // already shot here

  send({ type: 'shot', r, c });
  myTurn = false;
  updateTurnIndicator();
}

function updateScores() {
  $('score-you').textContent = myScore;
  $('score-opp').textContent = oppScore;
}

function updateTurnIndicator() {
  const el = $('turn-indicator');
  if (myTurn) {
    el.textContent = 'Dein Zug';
    el.className = 'turn-indicator your-turn';
  } else {
    el.textContent = 'Gegner ist dran';
    el.className = 'turn-indicator opp-turn';
  }
}

// ---- Message handling ----
function handleMessage(data) {
  // Jede empfangene Nachricht zaehlt als Lebenszeichen.
  lastSeen = Date.now();

  // Eingehende Quittung: Nachricht gilt als zugestellt, nicht mehr wiederholen.
  if (data.type === '__ack') {
    pendingAcks.delete(data._ack);
    return;
  }

  // Zuverlaessige Nachricht: immer quittieren (auch Duplikate, falls ein ACK verloren ging)
  // und bereits verarbeitete Nachrichten nicht erneut anwenden (Dedupe).
  if (data._seq != null) {
    rawSend({ type: '__ack', _ack: data._seq });
    if (seenSeqs.has(data._seq)) return;
    seenSeqs.add(data._seq);
  }

  switch (data.type) {
    case 'ping':
      // Zug-Zustand des Gegners merken und mit Pong (inkl. eigenem Zustand) antworten.
      peerIdle = !!data.idle;
      peerBusy = !!data.busy;
      send({ type: 'pong', t: data.t, idle: !myTurn, busy: isQuizOpen() });
      checkTurnDeadlock();
      return;
    case 'pong':
      peerIdle = !!data.idle;
      peerBusy = !!data.busy;
      checkTurnDeadlock();
      return;
    case 'chat':
      receiveChatMessage(data.text);
      return;

    case 'ready':
      opponentReady = true;
      if (meReady) startGame();
      break;

    case 'shot':
      handleIncomingShot(data.r, data.c);
      break;

    case 'shot-result':
      handleShotResult(data);
      break;

    case 'quiz-answer-result':
      handleQuizAnswerResult(data);
      break;

    case 'quiz-answer':
      handleOpponentQuizAnswer(data);
      break;
  }
}

function handleIncomingShot(r, c) {
  const isHit = myBoard[r][c] === 1;
  const cell = getOwnCell(r, c);

  if (isHit) {
    cell.classList.add('hit');
    addFaceToCell(cell);
    let shipSunk = false;
    let sunkCells = [];
    for (const ship of myShips) {
      const match = ship.cells.find(([sr, sc]) => sr === r && sc === c);
      if (match) {
        ship.hitsLeft--;
        if (ship.hitsLeft <= 0) {
          ship.sunk = true;
          shipSunk = true;
          sunkCells = ship.cells;
        }
        break;
      }
    }
    // Send a quiz question for the opponent to answer
    const q = getRandomQuestion();
    send({
      type: 'shot-result',
      r, c,
      hit: true,
      shipSunk,
      sunkCells,
      question: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      qIndex: q._index
    });
  } else {
    if (cell) cell.classList.add('miss');
    send({ type: 'shot-result', r, c, hit: false });
    // My turn now since opponent missed
    myTurn = true;
    updateTurnIndicator();
  }
}

function handleShotResult(data) {
  const cell = getEnemyCell(data.r, data.c);
  if (!data.hit) {
    enemyBoard[data.r][data.c] = -1; // miss
    if (cell) cell.classList.add('miss');
    // Opponent's turn (already set myTurn = false)
    myTurn = false;
    updateTurnIndicator();
  } else {
    // It's a hit – show quiz
    enemyBoard[data.r][data.c] = 2; // hit pending confirmation
    if (cell) { cell.classList.add('hit'); addFaceToCell(cell); }
    pendingShotR = data.r;
    pendingShotC = data.c;
    showQuiz(data.question, data.answers, data.correctIndex, data.shipSunk, data.sunkCells);
  }
}

function showQuiz(question, answers, correctIndex, shipSunk, sunkCells) {
  $('quiz-overlay').classList.remove('hidden');
  $('quiz-question').textContent = question;
  $('quiz-result').classList.add('hidden');
  const container = $('quiz-answers');
  container.innerHTML = '';

  answers.forEach((ans, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-btn';
    btn.textContent = ans;
    btn.addEventListener('click', () => {
      answerQuiz(i, correctIndex, shipSunk, sunkCells);
    });
    container.appendChild(btn);
  });
}

function answerQuiz(chosen, correctIndex, shipSunk, sunkCells) {
  const buttons = $('quiz-answers').querySelectorAll('.quiz-btn');
  buttons.forEach((btn, i) => {
    btn.classList.add('disabled');
    if (i === correctIndex) btn.classList.add('correct');
    if (i === chosen && chosen !== correctIndex) btn.classList.add('wrong');
  });

  const isCorrect = chosen === correctIndex;
  const result = $('quiz-result');
  result.classList.remove('hidden');

  if (isCorrect) {
    result.textContent = 'Richtig! Treffer bestätigt!';
    result.className = 'quiz-result correct-result';
  } else {
    result.textContent = 'Falsch! Treffer verfällt.';
    result.className = 'quiz-result wrong-result';
  }

  send({
    type: 'quiz-answer',
    correct: isCorrect,
    r: pendingShotR,
    c: pendingShotC,
    shipSunk,
    sunkCells
  });

  setTimeout(() => {
    $('quiz-overlay').classList.add('hidden');

    if (isCorrect) {
      oppScore--;
      const cell = getEnemyCell(pendingShotR, pendingShotC);
      if (cell) {
        cell.classList.add('exploding');
        setTimeout(() => {
          cell.classList.remove('exploding');
          if (shipSunk && sunkCells) {
            sunkCells.forEach(([sr, sc]) => {
              const sunkCell = getEnemyCell(sr, sc);
              if (sunkCell) sunkCell.classList.add('sunk');
            });
          }
        }, 600);
      }
      updateScores();
      if (oppScore <= 0) {
        showGameOver('Gewonnen!', 'Du hast alle Schiffe versenkt!');
        send({ type: 'game-over' });
        return;
      }
    } else {
      // Revert the hit visually
      const cell = getEnemyCell(pendingShotR, pendingShotC);
      if (cell) {
        cell.classList.remove('hit', 'has-face');
        const face = cell.querySelector('.face-hit');
        if (face) face.remove();
      }
      enemyBoard[pendingShotR][pendingShotC] = 0; // Reset so can shoot again
    }

    // Turn passes to opponent regardless
    myTurn = false;
    updateTurnIndicator();
  }, 1800);
}

function handleOpponentQuizAnswer(data) {
  if (data.correct) {
    myScore--;
    updateScores();
    const cell = getOwnCell(data.r, data.c);
    if (cell) {
      cell.classList.add('exploding');
      setTimeout(() => {
        cell.classList.remove('exploding');
        if (data.shipSunk && data.sunkCells) {
          data.sunkCells.forEach(([sr, sc]) => {
            const sunkCell = getOwnCell(sr, sc);
            if (sunkCell) sunkCell.classList.add('sunk');
          });
        }
      }, 600);
    }
    if (myScore <= 0) {
      showGameOver('Verloren!', 'Alle deine Schiffe wurden versenkt.');
      return;
    }
  } else {
    // Opponent missed the quiz – revert hit on own board
    const cell = getOwnCell(data.r, data.c);
    if (cell) {
      cell.classList.remove('hit', 'has-face');
      const face = cell.querySelector('.face-hit');
      if (face) face.remove();
    }
    myBoard[data.r][data.c] = 1; // Restore ship cell
    // Also restore ship hitsLeft
    for (const ship of myShips) {
      const match = ship.cells.find(([sr, sc]) => sr === data.r && sc === data.c);
      if (match) {
        ship.hitsLeft++;
        ship.sunk = false;
        break;
      }
    }
  }
  // Now it's my turn
  myTurn = true;
  updateTurnIndicator();
}

// ---- Game Over ----
function showGameOver(title, text) {
  gameActive = false;
  stopHeartbeat();
  stopRetransmit();
  pendingAcks.clear();
  $('gameover-overlay').classList.remove('hidden');
  $('gameover-title').textContent = title;
  $('gameover-text').textContent = text;
  $('btn-restart').addEventListener('click', () => {
    intentionalClose = true;
    location.reload();
  });
}

/* ============================================
   CHAT (Messenger-Stil) – nur Ergaenzung
   ============================================ */

const CHAT_EMOJIS = ['👍', '😂', '🔥', '💀', '🎯', '👀', '💪', '😤'];
const CHAT_MAX_LEN = 200;
let chatOpen = false;
let chatUnread = 0;

window.addEventListener('DOMContentLoaded', setupChat);

function setupChat() {
  const toggle = $('chat-toggle');
  const closeBtn = $('chat-close');
  const sendBtn = $('chat-send');
  const input = $('chat-input');
  const emojiBar = $('chat-emojis');
  if (!toggle || !closeBtn || !sendBtn || !input || !emojiBar) return;

  // Emoji-Leiste aufbauen – Klick fuegt das Emoji ins Textfeld ein.
  CHAT_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'chat-emoji';
    btn.type = 'button';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      input.value = (input.value + emoji).slice(0, CHAT_MAX_LEN);
      input.focus();
    });
    emojiBar.appendChild(btn);
  });

  toggle.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', sendChatMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); }
  });

  setupInfo();
}

// ---- Info-Button ----
function setupInfo() {
  const infoToggle = $('info-toggle');
  const popup = $('info-popup');
  if (!infoToggle || !popup) return;
  infoToggle.addEventListener('click', e => {
    e.stopPropagation();
    popup.classList.toggle('hidden');
  });
  // Klick ausserhalb schliesst das Popup wieder.
  document.addEventListener('click', e => {
    if (!popup.contains(e.target) && e.target !== infoToggle) {
      popup.classList.add('hidden');
    }
  });
}

function openChat() {
  chatOpen = true;
  $('chat-window').classList.remove('hidden');
  $('chat-toggle').classList.add('hidden');
  chatUnread = 0;
  updateChatBadge();
  $('chat-input').focus();
}

function closeChat() {
  chatOpen = false;
  $('chat-window').classList.add('hidden');
  $('chat-toggle').classList.remove('hidden');
}

function updateChatBadge() {
  const badge = $('chat-unread');
  if (!badge) return;
  if (!chatOpen && chatUnread > 0) {
    badge.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function sendChatMessage() {
  const input = $('chat-input');
  if (!input) return;
  const text = input.value.trim().slice(0, CHAT_MAX_LEN);
  if (!text) return;
  send({ type: 'chat', text });
  appendChatMessage(text, 'mine');
  input.value = '';
  input.focus();
}

function receiveChatMessage(text) {
  if (typeof text !== 'string') return;
  const clean = text.trim().slice(0, CHAT_MAX_LEN);
  if (!clean) return;
  appendChatMessage(clean, 'theirs');
  if (!chatOpen) {
    chatUnread++;
    updateChatBadge();
  }
}

function appendChatMessage(text, side) {
  const list = $('chat-messages');
  if (!list) return;
  const msg = document.createElement('div');
  msg.className = 'chat-msg ' + side;
  msg.textContent = text; // textContent => kein HTML-Injection
  list.appendChild(msg);
  list.scrollTop = list.scrollHeight; // Auto-Scroll nach unten
}
