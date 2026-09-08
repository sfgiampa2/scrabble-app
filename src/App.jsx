import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://xlzeuduftbvedjisfbip.supabase.co",
  "sb_publishable_fvIHoyum37kgBpfnSjIp6w_vzrG25At"
);

// ─── Palette ──────────────────────────────────────────────────────────────────
const P = {
  bg:      "#0f0f14",
  surface: "#1a1a24",
  border:  "#2a2a3a",
  navy:    "#1D3169",
  red:     "#E21D38",
  gold:    "#FFC300",
  steel:   "#A9C2DC",
  tile:    "#F2E8C4",
  tileShadow:"#C9A84C",
  brown:   "#6B4226",
  white:   "#FFFFFF",
  text:    "#e8e8f0",
  muted:   "rgba(255,255,255,0.4)",
  // Board square colors — more distinct
  tw:      "#C0392B", // triple word - bold red
  dw:      "#E8877A", // double word - salmon
  tl:      "#1A5276", // triple letter - deep blue
  dl:      "#5DADE2", // double letter - bright blue
  star:    "#C0392B", // center star
  normal:  "#1a2e1a", // normal square - dark green
  boardBg: "#0d1f0d", // board background
};

const PLAYER_COLORS = ["#2980B9","#E21D38","#8E44AD","#27AE60"];

// ─── Scrabble Constants ───────────────────────────────────────────────────────
// Premium square layout (0=normal,DL=double letter,TL=triple letter,DW=double word,TW=triple word,ST=star)
const BOARD_LAYOUT = [
  ["TW","","","DL","","","","TW","","","","DL","","","TW"],
  ["","DW","","","","TL","","","","TL","","","","DW",""],
  ["","","DW","","","","DL","","DL","","","","DW","",""],
  ["DL","","","DW","","","","DL","","","","DW","","","DL"],
  ["","","","","DW","","","","","","DW","","","",""],
  ["","TL","","","","TL","","","","TL","","","","TL",""],
  ["","","DL","","","","DL","","DL","","","","DL","",""],
  ["TW","","","DL","","","","ST","","","","DL","","","TW"],
  ["","","DL","","","","DL","","DL","","","","DL","",""],
  ["","TL","","","","TL","","","","TL","","","","TL",""],
  ["","","","","DW","","","","","","DW","","","",""],
  ["DL","","","DW","","","","DL","","","","DW","","","DL"],
  ["","","DW","","","","DL","","DL","","","","DW","",""],
  ["","DW","","","","TL","","","","TL","","","","DW",""],
  ["TW","","","DL","","","","TW","","","","DL","","","TW"],
];

const TILE_DISTRIBUTION = {
  A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,
  N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1,"_":2
};

const TILE_VALUES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,
  N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10,"_":0
};

function buildBag() {
  const bag = [];
  Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
    for (let i = 0; i < count; i++) bag.push(letter);
  });
  // Shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function drawTiles(bag, count) {
  const drawn = bag.slice(0, count);
  const remaining = bag.slice(count);
  return { drawn, remaining };
}

function generateId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildShareLink(gameId) {
  return `${window.location.origin}${window.location.pathname}?game=${gameId}`;
}

function getGameIdFromUrl() {
  return new URLSearchParams(window.location.search).get("game");
}

function getSquareStyle(type) {
  switch(type) {
    case "TW": return { bg: P.tw,     label: "3W", color: "rgba(255,255,255,0.9)" };
    case "DW": return { bg: P.dw,     label: "2W", color: "rgba(255,255,255,0.9)" };
    case "TL": return { bg: P.tl,     label: "3L", color: "rgba(255,255,255,0.9)" };
    case "DL": return { bg: P.dl,     label: "2L", color: "rgba(255,255,255,0.9)" };
    case "ST": return { bg: P.star,   label: "★",  color: "rgba(255,255,255,0.9)" };
    default:   return { bg: P.normal, label: "",   color: "transparent" };
  }
}

// ─── Word Validation ──────────────────────────────────────────────────────────
// Use multiple word lists for validation — fast local check first
const COMMON_INVALID = new Set(["sitt","sitt","ett","ott","ott","tit","sis"]);

async function isValidWord(word) {
  if (word.length < 2) return false;
  const w = word.toLowerCase();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${w}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    return res.ok;
  } catch (e) {
    if (e.name === "AbortError") {
      // Timed out — try backup
      try {
        const res2 = await fetch(`https://api.wordnik.com/v4/word.json/${w}/definitions?limit=1&api_key=a2a73e7b947cad4cbbd280c7b2c3b8b4ce31020ea97e0ef8`);
        return res2.ok;
      } catch {
        return false; // fail closed on timeout
      }
    }
    return false;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const viewRef = useRef("home");
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myPlayer, setMyPlayer] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);

  function setViewBoth(v) { setView(v); viewRef.current = v; }

  useEffect(() => {
    const id = getGameIdFromUrl();
    if (id) { setGameId(id); gameIdRef.current = id; setViewBoth("join"); }
  }, []);

  useEffect(() => {
    if (!gameId) return;
    gameIdRef.current = gameId;
    loadGame(gameId);

    // Real-time subscriptions
    const ch = supabase.channel(`game:${gameId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"games", filter:`id=eq.${gameId}` },
        (p) => {
          if (p.new) {
            setGame(p.new);
            if (p.new.status === "playing" && viewRef.current === "lobby") setViewBoth("game");
          }
        })
      .on("postgres_changes", { event:"*", schema:"public", table:"game_players", filter:`game_id=eq.${gameId}` },
        () => loadPlayers(gameId))
      .subscribe();

    // Polling fallback every 3s for lobby (in case real-time misses)
    const poll = setInterval(async () => {
      const currentView = viewRef.current;
      const currentGameId = gameIdRef.current;
      if (!currentGameId) return;
      if (currentView === "lobby" || currentView === "game") {
        await loadPlayers(currentGameId);
        const { data } = await supabase.from("games").select("status,current_player,board,bag,turn_number").eq("id",currentGameId).single();
        if (data) {
          setGame(prev => ({ ...prev, ...data }));
          if (data.status === "playing" && currentView === "lobby") setViewBoth("game");
        }
      }
    }, 3000);

    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [gameId]);

  async function loadGame(id) {
    const { data } = await supabase.from("games").select("*").eq("id", id).single();
    if (data) { setGame(data); if (data.status === "playing") setViewBoth("game"); }
    await loadPlayers(id);
  }

  async function loadPlayers(id) {
    const { data } = await supabase.from("game_players").select("*").eq("game_id", id).order("position");
    if (data) setPlayers(data);
  }

  function notify(msg, type="success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }

  async function createGame(hostName) {
    if (!hostName.trim()) return notify("Enter your name","error");
    setLoading(true);
    const id = generateId();
    const playerId = generateId();
    const bag = buildBag();
    const { drawn, remaining } = drawTiles(bag, 7);
    await supabase.from("games").insert({ id, status:"waiting", board:{}, bag:remaining, current_player:null, turn_number:0 });
    await supabase.from("game_players").insert({ id:playerId, game_id:id, name:hostName.trim(), color:PLAYER_COLORS[0], rack:drawn, score:0, position:0 });
    setGameId(id); setMyPlayer({ id:playerId, name:hostName.trim(), color:PLAYER_COLORS[0], rack:drawn, score:0, position:0 });
    window.history.pushState({}, "", `?game=${id}`);
    setLoading(false); setViewBoth("lobby");
  }

  async function joinGame(playerName) {
    if (!playerName.trim()) return notify("Enter your name","error");
    if (!gameId) return notify("No game found","error");
    setLoading(true);
    const { data: gd } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (!gd) { notify("Game not found","error"); setLoading(false); return; }
    if (gd.status === "playing") { notify("Game already started","error"); setLoading(false); return; }
    const { data: ep } = await supabase.from("game_players").select("*").eq("game_id", gameId);
    if (ep?.length >= 4) { notify("Game is full","error"); setLoading(false); return; }
    const playerId = generateId();
    const position = ep?.length || 0;
    const { drawn, remaining } = drawTiles(gd.bag || [], 7);
    await supabase.from("game_players").insert({ id:playerId, game_id:gameId, name:playerName.trim(), color:PLAYER_COLORS[position], rack:drawn, score:0, position });
    await supabase.from("games").update({ bag: remaining }).eq("id", gameId);
    setMyPlayer({ id:playerId, name:playerName.trim(), color:PLAYER_COLORS[position], rack:drawn, score:0, position });
    setGame(gd); setLoading(false); setViewBoth("lobby");
  }

  async function startGame() {
    if (players.length < 2) return notify("Need at least 2 players","error");
    await supabase.from("games").update({ status:"playing", current_player: players[0]?.id }).eq("id", gameId);
    setViewBoth("game");
  }

  function leaveGame() {
    setViewBoth("home"); setGameId(null); setGame(null); setPlayers([]); setMyPlayer(null);
    window.history.pushState({}, "", window.location.pathname);
  }

  return (
    <div style={styles.root}>
      {notification && (
        <div style={{ ...styles.notification, background: notification.type==="error" ? P.red : "#2D7A1F" }}>
          {notification.msg}
        </div>
      )}
      {view==="home"  && <HomeView onCreate={createGame} loading={loading} />}
      {view==="join"  && <JoinView gameId={gameId} onJoin={joinGame} loading={loading} />}
      {view==="lobby" && game && <LobbyView game={game} players={players} myPlayer={myPlayer} gameId={gameId} onStart={startGame} onBack={leaveGame} notify={notify} />}
      {view==="game"  && game && <GameBoard game={game} players={players} myPlayer={myPlayer} gameId={gameId} notify={notify} onBack={leaveGame} />}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({ onCreate, loading }) {
  const [name, setName] = useState("");
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.heroTiles}>
          {"SCRABBLE".split("").map((l,i) => (
            <div key={i} style={styles.heroTile}>{l}</div>
          ))}
        </div>
        <p style={styles.heroSub}>Up to 4 players · Real-time · Full rules</p>
      </div>
      <div style={styles.card}>
        <label style={styles.label}>Your name</label>
        <input style={styles.input} placeholder="Enter your name…" value={name}
          onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onCreate(name)} autoFocus />
        <button style={{ ...styles.btnPrimary, width:"100%", opacity:loading?0.6:1 }}
          onClick={()=>onCreate(name)} disabled={loading}>
          {loading ? "Creating…" : "Create New Game"}
        </button>
      </div>
      <div style={styles.divider}><span>or join with a link from your host</span></div>
    </div>
  );
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────
function JoinView({ gameId, onJoin, loading }) {
  const [name, setName] = useState("");
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.heroTiles}>
          {"SCRABBLE".split("").map((l,i) => <div key={i} style={styles.heroTile}>{l}</div>)}
        </div>
      </div>
      <div style={styles.card}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:12, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:6 }}>JOINING GAME</div>
          <div style={{ fontSize:32, fontWeight:900, color:P.gold, fontFamily:"Georgia, serif", letterSpacing:4 }}>{gameId}</div>
        </div>
        <label style={styles.label}>Your name</label>
        <input style={styles.input} placeholder="Enter your name…" value={name}
          onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onJoin(name)} autoFocus />
        <button style={{ ...styles.btnPrimary, width:"100%", opacity:loading?0.6:1 }}
          onClick={()=>onJoin(name)} disabled={loading}>
          {loading ? "Joining…" : "Join Game"}
        </button>
      </div>
    </div>
  );
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
function LobbyView({ game, players, myPlayer, gameId, onStart, onBack, notify }) {
  const [copied, setCopied] = useState(false);
  const isHost = players[0]?.id === myPlayer?.id;
  function copyLink() {
    navigator.clipboard.writeText(buildShareLink(gameId)).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  }
  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← Leave</button>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:12, color:P.steel, fontWeight:700, letterSpacing:3, marginBottom:8 }}>GAME LOBBY</div>
        <div style={{ fontSize:40, fontWeight:900, color:P.gold, fontFamily:"Georgia, serif", letterSpacing:6 }}>{gameId}</div>
      </div>
      <div style={{ ...styles.card, display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <span style={{ flex:1, fontSize:13, color:P.muted }}>🔗 Share to invite players</span>
        <button style={styles.btnSecondary} onClick={copyLink}>{copied?"Copied! ✓":"Copy Link"}</button>
      </div>
      <div style={styles.card}>
        <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:16 }}>PLAYERS ({players.length}/4)</div>
        {players.map((p,i) => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom: i<players.length-1?"1px solid rgba(255,255,255,0.06)":"none" }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:p.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, color:P.white, fontSize:16 }}>
              {p.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:P.text, fontSize:15 }}>{p.name}</div>
              <div style={{ fontSize:12, color:P.muted }}>{i===0?"Host":`Player ${i+1}`}</div>
            </div>
            {p.id===myPlayer?.id && <span style={{ fontSize:11, color:P.gold, fontWeight:700 }}>YOU</span>}
          </div>
        ))}
        {players.length < 4 && (
          <div style={{ padding:"10px 0", opacity:0.25, display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:P.text }}>+</div>
            <span style={{ color:P.text, fontSize:14 }}>Waiting for player…</span>
          </div>
        )}
      </div>
      {isHost ? (
        <button style={{ ...styles.btnPrimary, width:"100%", marginTop:24, opacity:players.length<2?0.4:1 }}
          onClick={onStart} disabled={players.length<2}>
          {players.length<2?"Need at least 2 players":"Start Game →"}
        </button>
      ) : (
        <div style={{ textAlign:"center", color:P.muted, marginTop:24, fontSize:14 }}>Waiting for host to start…</div>
      )}
    </div>
  );
}

// ─── GAME BOARD ───────────────────────────────────────────────────────────────
function GameBoard({ game, players, myPlayer, gameId, notify, onBack }) {
  const [board, setBoard] = useState(game.board || {});
  const [myRack, setMyRack] = useState([]);
  const [placed, setPlaced] = useState({}); // { "7,7": { letter:"A", tileIdx:0 } }
  const [selectedTile, setSelectedTile] = useState(null); // index in rack
  const [dragTile, setDragTile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [scores, setScores] = useState({});
  const [gameOver, setGameOver] = useState(false);
  const [swapMode, setSwapMode] = useState(false);
  const [swapSelected, setSwapSelected] = useState(new Set());
  const isMyTurn = game.current_player === myPlayer?.id;

  // Load my rack from players — only update if not mid-play
  useEffect(() => {
    const me = players.find(p => p.id === myPlayer?.id);
    if (me?.rack && Object.keys(placed).length === 0) {
      setMyRack(me.rack);
    }
  }, [players]);

  // Sync board from game
  useEffect(() => {
    if (game.board) setBoard(game.board);
    if (game.status === "finished") setGameOver(true);
    // Sync scores
    const s = {};
    players.forEach(p => { s[p.id] = p.score; });
    setScores(s);
  }, [game, players]);

  // Real-time board updates
  useEffect(() => {
    const ch = supabase.channel(`board:${gameId}`)
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"games", filter:`id=eq.${gameId}` },
        (p) => { if (p.new?.board) setBoard(p.new.board); if (p.new) setGame && null; })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [gameId]);

  function handleSquareClick(row, col) {
    const key = `${row},${col}`;
    if (board[key]) return; // already has permanent tile
    if (placed[key]) {
      // Remove tile back to rack
      const tile = placed[key];
      const newRack = [...myRack];
      newRack.splice(tile.rackIdx, 0, tile.letter);
      setMyRack(newRack);
      const newPlaced = { ...placed };
      delete newPlaced[key];
      setPlaced(newPlaced);
      setSelectedTile(null);
      return;
    }
    if (selectedTile !== null) {
      const letter = myRack[selectedTile];
      const newRack = [...myRack];
      newRack.splice(selectedTile, 1);
      setMyRack(newRack);
      setPlaced({ ...placed, [key]: { letter, rackIdx: selectedTile } });
      setSelectedTile(null);
    }
  }

  function handleTileClick(idx) {
    if (!isMyTurn) return;
    setSelectedTile(selectedTile === idx ? null : idx);
  }

  function handleDragStart(idx) {
    setDragTile({ fromRack: true, idx });
    setSelectedTile(idx);
  }

  function handleDropOnSquare(e, row, col) {
    e.preventDefault();
    const key = `${row},${col}`;
    if (board[key] || placed[key]) return;
    if (dragTile === null) return;
    let letter, newRack;
    if (dragTile?.fromRack) {
      letter = myRack[dragTile.idx];
      newRack = [...myRack];
      newRack.splice(dragTile.idx, 1);
    } else if (dragTile?.fromBoard) {
      // Already removed from placed and added to rack in handleDragFromBoard
      letter = dragTile.tile.letter;
      newRack = myRack.filter(l => {
        const idx = myRack.lastIndexOf(letter);
        return idx === -1;
      });
      // Simpler: just remove last occurrence of that letter from rack
      newRack = [...myRack];
      const lastIdx = newRack.lastIndexOf(letter);
      if (lastIdx !== -1) newRack.splice(lastIdx, 1);
    } else {
      return;
    }
    setMyRack(newRack);
    setPlaced({ ...placed, [key]: { letter } });
    setDragTile(null);
    setSelectedTile(null);
  }

  function handleDragOver(e) { e.preventDefault(); }

  function handleDragFromBoard(row, col) {
    const key = `${row},${col}`;
    if (!placed[key]) return;
    // Remove from placed, put back in hand temporarily
    setDragTile({ fromBoard: true, key, tile: placed[key] });
    const newPlaced = { ...placed };
    delete newPlaced[key];
    setPlaced(newPlaced);
    // Temporarily add back to rack so it can be re-dropped
    setMyRack(prev => [...prev, placed[key].letter]);
  }

  function recallTiles() {
    const letters = Object.values(placed).map(t => t.letter);
    setMyRack([...myRack, ...letters]);
    setPlaced({});
    setSelectedTile(null);
  }

  function getPlacedWords() {
    const allTiles = { ...board };
    Object.entries(placed).forEach(([key, t]) => { allTiles[key] = t.letter; });
    const words = [];
    const placedKeys = Object.keys(placed);
    if (placedKeys.length === 0) return [];
    // Find words - check horizontal and vertical through each placed tile
    const checked = new Set();
    placedKeys.forEach(key => {
      const [r, c] = key.split(",").map(Number);
      // Horizontal word
      let startC = c;
      while (startC > 0 && allTiles[`${r},${startC-1}`]) startC--;
      let word = ""; let wCols = [];
      let cc = startC;
      while (cc < 15 && allTiles[`${r},${cc}`]) { word += allTiles[`${r},${cc}`]; wCols.push(cc); cc++; }
      const hKey = `H${r},${startC}`;
      if (word.length > 1 && !checked.has(hKey)) { checked.add(hKey); words.push({ word, squares: wCols.map(col=>({r,c:col})) }); }
      // Vertical word
      let startR = r;
      while (startR > 0 && allTiles[`${startR-1},${c}`]) startR--;
      word = ""; let wRows = [];
      let rr = startR;
      while (rr < 15 && allTiles[`${rr},${c}`]) { word += allTiles[`${rr},${c}`]; wRows.push(rr); rr++; }
      const vKey = `V${startR},${c}`;
      if (word.length > 1 && !checked.has(vKey)) { checked.add(vKey); words.push({ word, squares: wRows.map(row=>({r:row,c})) }); }
    });
    return words;
  }

  function calculateScore() {
    const allTiles = { ...board };
    Object.entries(placed).forEach(([key, t]) => { allTiles[key] = t.letter; });
    let total = 0;
    const words = getPlacedWords();
    words.forEach(({ word, squares }) => {
      let wordScore = 0; let wordMult = 1;
      squares.forEach(({ r, c }) => {
        const key = `${r},${c}`;
        const letter = allTiles[key] === "_" ? 0 : (TILE_VALUES[allTiles[key]] || 0);
        const squareType = BOARD_LAYOUT[r][c];
        const isNew = placed[key];
        if (isNew) {
          if (squareType === "TL") wordScore += letter * 3;
          else if (squareType === "DL") wordScore += letter * 2;
          else wordScore += letter;
          if (squareType === "TW" || squareType === "ST") wordMult *= 3;
          else if (squareType === "DW") wordMult *= 2;
        } else {
          wordScore += letter;
        }
      });
      total += wordScore * wordMult;
    });
    // Bingo bonus
    if (Object.keys(placed).length === 7) total += 50;
    return total;
  }

  function toggleSwapSelect(idx) {
    const next = new Set(swapSelected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSwapSelected(next);
  }

  async function confirmSwap() {
    if (swapSelected.size === 0) return notify("Select tiles to swap","error");
    const { data: gameData } = await supabase.from("games").select("bag").eq("id",gameId).single();
    const bag = gameData?.bag || [];
    if (bag.length < swapSelected.size) return notify("Not enough tiles in bag","error");
    // Draw new tiles
    const { drawn, remaining } = drawTiles(bag, swapSelected.size);
    // Put selected tiles back in bag (shuffled)
    const returnedTiles = [...swapSelected].map(idx => myRack[idx]);
    const newBag = [...remaining, ...returnedTiles].sort(() => Math.random() - 0.5);
    // Build new rack
    const newRack = myRack.filter((_, idx) => !swapSelected.has(idx));
    newRack.push(...drawn);
    // Next player
    const myIdx = players.findIndex(p=>p.id===myPlayer?.id);
    const nextIdx = (myIdx+1)%players.length;
    await supabase.from("games").update({ bag:newBag, current_player:players[nextIdx].id, turn_number:(game.turn_number||0)+1 }).eq("id",gameId);
    await supabase.from("game_players").update({ rack:newRack }).eq("id",myPlayer?.id);
    await supabase.from("moves").insert({ id:generateId(), game_id:gameId, player_id:myPlayer?.id, tiles_placed:{}, words_formed:[], score:0, move_type:"swap" });
    setMyRack(newRack);
    setSwapMode(false);
    setSwapSelected(new Set());
    notify(`Swapped ${swapSelected.size} tile${swapSelected.size!==1?"s":""}!`);
  }

  async function submitPlay() {
    if (Object.keys(placed).length === 0) return notify("Place some tiles first","error");
    // Validate placement
    const keys = Object.keys(placed).map(k => k.split(",").map(Number));
    const rows = keys.map(k=>k[0]); const cols = keys.map(k=>k[1]);
    const allSameRow = rows.every(r=>r===rows[0]);
    const allSameCol = cols.every(c=>c===cols[0]);
    if (!allSameRow && !allSameCol) return notify("Tiles must be in a straight line","error");
    // Check center square on first move
    const isFirstMove = Object.keys(board).length === 0;
    if (isFirstMove && !placed["7,7"]) return notify("First word must cover the center star","error");
    // Check connectivity
    if (!isFirstMove) {
      const allTiles = { ...board };
      Object.entries(placed).forEach(([k,t]) => { allTiles[k] = t.letter; });
      let connected = false;
      Object.keys(placed).forEach(key => {
        const [r,c] = key.split(",").map(Number);
        if (board[`${r-1},${c}`]||board[`${r+1},${c}`]||board[`${r},${c-1}`]||board[`${r},${c+1}`]) connected = true;
      });
      if (!connected) return notify("Tiles must connect to existing words","error");
    }
    setValidating(true);
    const words = getPlacedWords();
    if (words.length === 0) { setValidating(false); return notify("No valid words formed","error"); }
    // Validate each word
    for (const { word } of words) {
      const valid = await isValidWord(word);
      if (!valid) { setValidating(false); return notify(`"${word}" is not a valid word`,"error"); }
    }
    const score = calculateScore();
    // Update board
    const newBoard = { ...board };
    Object.entries(placed).forEach(([key,t]) => { newBoard[key] = t.letter; });
    // Draw new tiles
    const { data: gameData } = await supabase.from("games").select("bag").eq("id",gameId).single();
    const bag = gameData?.bag || [];
    const needed = Object.keys(placed).length;
    const { drawn, remaining } = drawTiles(bag, needed);
    const newRack = [...myRack, ...drawn];
    // Next player
    const myIdx = players.findIndex(p=>p.id===myPlayer?.id);
    const nextIdx = (myIdx+1) % players.length;
    const nextPlayer = players[nextIdx];
    // Save move
    await supabase.from("moves").insert({ id:generateId(), game_id:gameId, player_id:myPlayer?.id, tiles_placed:placed, words_formed:words.map(w=>w.word), score, move_type:"play" });
    await supabase.from("games").update({ board:newBoard, bag:remaining, current_player:nextPlayer.id, turn_number:(game.turn_number||0)+1 }).eq("id",gameId);
    await supabase.from("game_players").update({ rack:newRack, score:(scores[myPlayer?.id]||0)+score }).eq("id",myPlayer?.id);
    setMyRack(newRack);
    setPlaced({});
    setValidating(false);
    notify(`+${score} points! ${words.map(w=>w.word).join(", ")}`);
  }

  async function passTurn() {
    const myIdx = players.findIndex(p=>p.id===myPlayer?.id);
    const nextIdx = (myIdx+1)%players.length;
    await supabase.from("games").update({ current_player:players[nextIdx].id, turn_number:(game.turn_number||0)+1 }).eq("id",gameId);
    await supabase.from("moves").insert({ id:generateId(), game_id:gameId, player_id:myPlayer?.id, tiles_placed:{}, words_formed:[], score:0, move_type:"pass" });
    notify("Turn passed");
  }

  const CELL = 38;

  return (
    <div style={{ minHeight:"100vh", background:P.bg, fontFamily:"'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background:P.surface, borderBottom:`1px solid ${P.border}`, padding:"10px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button style={styles.backBtn} onClick={onBack}>← Leave</button>
        <div style={{ flex:1 }} />
        {players.map(p => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:20, background:game.current_player===p.id?`${p.color}22`:"transparent", border:game.current_player===p.id?`1px solid ${p.color}`:"1px solid transparent" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:p.color }} />
            <span style={{ fontSize:13, fontWeight:game.current_player===p.id?700:400, color:P.text }}>{p.name}</span>
            <span style={{ fontSize:13, fontWeight:700, color:P.gold }}>{scores[p.id]||0}</span>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"16px 8px" }}>
        {/* Turn indicator */}
        <div style={{ marginBottom:12, fontSize:14, fontWeight:700, color:isMyTurn?P.gold:P.muted }}>
          {isMyTurn ? "🎯 Your turn!" : `Waiting for ${players.find(p=>p.id===game.current_player)?.name}…`}
        </div>

        {/* Board */}
        <div style={{ border:`3px solid ${P.brown}`, borderRadius:8, overflow:"auto", maxWidth:"100vw", boxShadow:"0 0 30px rgba(0,0,0,0.6)" }}>
          <div style={{ display:"grid", gridTemplateColumns:`repeat(15, ${CELL}px)`, gridTemplateRows:`repeat(15, ${CELL}px)`, gap:2, background:"#0d1f0d", padding:2 }}>
            {BOARD_LAYOUT.map((row, r) =>
              row.map((type, c) => {
                const key = `${r},${c}`;
                const permanentTile = board[key];
                const placedTile = placed[key];
                const sq = getSquareStyle(type);
                const isSelected = selectedTile !== null;
                const canDrop = !permanentTile && !placedTile;
                return (
                  <div key={key}
                    style={{ width:CELL, height:CELL, background:permanentTile||placedTile?P.tile:sq.bg, display:"flex", alignItems:"center", justifyContent:"center", cursor:isMyTurn&&canDrop&&isSelected?"pointer":"default", position:"relative", fontSize:9, fontWeight:800, color:sq.color, borderRadius:3, transition:"all 0.15s", outline:placedTile?`2px solid ${P.gold}`:"none", boxShadow:placedTile?`0 0 8px ${P.gold}44`:"none" }}
                    onClick={() => isMyTurn && handleSquareClick(r,c)}
                    onDragOver={isMyTurn ? handleDragOver : undefined}
                    onDrop={isMyTurn ? (e)=>handleDropOnSquare(e,r,c) : undefined}
                    draggable={isMyTurn && !!placedTile}
                    onDragStart={isMyTurn && placedTile ? ()=>handleDragFromBoard(r,c) : undefined}
                  >
                    {permanentTile ? (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                        <span style={{ fontSize:14, fontWeight:900, color:P.brown, fontFamily:"Georgia, serif" }}>{permanentTile=="_"?"":permanentTile}</span>
                        <span style={{ fontSize:7, color:P.brown, lineHeight:1 }}>{TILE_VALUES[permanentTile]||""}</span>
                      </div>
                    ) : placedTile ? (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", cursor:"pointer" }} onClick={()=>isMyTurn&&handleSquareClick(r,c)}>
                        <span style={{ fontSize:14, fontWeight:900, color:P.brown, fontFamily:"Georgia, serif" }}>{placedTile.letter=="_"?"":placedTile.letter}</span>
                        <span style={{ fontSize:7, color:P.brown, lineHeight:1 }}>{TILE_VALUES[placedTile.letter]||""}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:8, color:sq.color, opacity:0.9, fontWeight:800 }}>{sq.label}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rack */}
        <div style={{ marginTop:16, background:P.surface, border:`1px solid ${P.border}`, borderRadius:12, padding:"12px 16px", width:"100%", maxWidth:600 }}>
          <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:10 }}>YOUR RACK</div>
          <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
            {myRack.map((letter, idx) => {
              const isSwapSel = swapSelected.has(idx);
              const isPlaceSel = selectedTile === idx;
              return (
                <div key={idx}
                  draggable={isMyTurn && !swapMode}
                  onDragStart={isMyTurn&&!swapMode ? (e)=>{ e.dataTransfer.effectAllowed="move"; handleDragStart(idx); } : undefined}
                  onClick={()=>{ if (!isMyTurn) return; if (swapMode) toggleSwapSelect(idx); else handleTileClick(idx); }}
                  style={{ width:44, height:44, background:isSwapSel?"#444":P.tile, borderRadius:6, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:isMyTurn?"pointer":"default",
                    boxShadow:isSwapSel?`0 0 0 3px ${P.red}, 0 3px 0 ${P.tileShadow}`:isPlaceSel?`0 0 0 3px ${P.gold}, 0 3px 0 ${P.tileShadow}`:`0 3px 0 ${P.tileShadow}`,
                    transform:isSwapSel||isPlaceSel?"translateY(-4px)":"none", transition:"all 0.1s",
                    opacity:!swapMode&&selectedTile!==null&&!isPlaceSel?0.6:1 }}>
                  <span style={{ fontSize:18, fontWeight:900, color:isSwapSel?P.muted:P.brown, fontFamily:"Georgia, serif", lineHeight:1 }}>{letter==="_"?"":letter}</span>
                  <span style={{ fontSize:9, color:isSwapSel?P.muted:P.brown }}>{TILE_VALUES[letter]||""}</span>
                </div>
              );
            })}
            {myRack.length === 0 && <span style={{ color:P.muted, fontSize:13 }}>No tiles remaining</span>}
          </div>

          {isMyTurn && (
            <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
              {!swapMode && Object.keys(placed).length > 0 && (
                <>
                  <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={recallTiles}>Recall</button>
                  <div style={{ fontSize:13, color:P.gold, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                    +{calculateScore()} pts
                  </div>
                  <button style={{ ...styles.btnPrimary, fontSize:13, padding:"8px 20px", opacity:validating?0.6:1 }} onClick={submitPlay} disabled={validating}>
                    {validating?"Checking…":"Play Word"}
                  </button>
                </>
              )}
              {!swapMode && Object.keys(placed).length === 0 && (
                <>
                  <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={()=>setSwapMode(true)}>Swap Tiles</button>
                  <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={passTurn}>Pass Turn</button>
                </>
              )}
              {swapMode && (
                <>
                  <div style={{ width:"100%", textAlign:"center", fontSize:12, color:P.muted, marginBottom:4 }}>
                    Select tiles to swap ({swapSelected.size} selected)
                  </div>
                  <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={()=>{ setSwapMode(false); setSwapSelected(new Set()); }}>Cancel</button>
                  <button style={{ ...styles.btnPrimary, fontSize:13, padding:"8px 20px", opacity:swapSelected.size===0?0.4:1 }}
                    onClick={confirmSwap} disabled={swapSelected.size===0}>
                    Confirm Swap
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Move history */}
        <MoveHistory gameId={gameId} players={players} />
      </div>
    </div>
  );
}

// ─── MOVE HISTORY ─────────────────────────────────────────────────────────────
function MoveHistory({ gameId, players }) {
  const [moves, setMoves] = useState([]);
  useEffect(() => {
    supabase.from("moves").select("*").eq("game_id", gameId).order("created_at", { ascending:false }).limit(10)
      .then(({ data }) => { if (data) setMoves(data); });
    const ch = supabase.channel(`moves:${gameId}`)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"moves", filter:`game_id=eq.${gameId}` },
        (p) => { if (p.new) setMoves(prev => [p.new, ...prev].slice(0,10)); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [gameId]);

  if (moves.length === 0) return null;

  return (
    <div style={{ marginTop:16, width:"100%", maxWidth:600 }}>
      <div style={styles.card}>
        <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:10 }}>RECENT MOVES</div>
        {moves.map(m => {
          const player = players.find(p=>p.id===m.player_id);
          return (
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.05)", fontSize:13 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:player?.color||P.muted, flexShrink:0 }} />
              <span style={{ color:P.text, fontWeight:600 }}>{player?.name}</span>
              {m.move_type==="pass" ? (
                <span style={{ color:P.muted }}>passed</span>
              ) : m.move_type==="swap" ? (
                <span style={{ color:P.muted }}>swapped tiles</span>
              ) : (
                <>
                  <span style={{ color:P.muted }}>played</span>
                  <span style={{ color:P.text }}>{(m.words_formed||[]).join(", ")}</span>
                  <span style={{ color:P.gold, fontWeight:700, marginLeft:"auto" }}>+{m.score}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root: { minHeight:"100vh", background:P.bg, fontFamily:"'Segoe UI', system-ui, sans-serif", color:P.text },
  page: { maxWidth:480, margin:"0 auto", padding:"24px 20px 60px" },
  notification: { position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", padding:"10px 24px", borderRadius:30, fontWeight:700, fontSize:14, color:P.white, zIndex:9999 },
  hero: { textAlign:"center", padding:"48px 0 40px" },
  heroTiles: { display:"flex", justifyContent:"center", gap:6, marginBottom:20 },
  heroTile: { width:44, height:44, background:P.tile, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:22, color:P.brown, boxShadow:`0 3px 0 ${P.tileShadow}, 0 4px 8px rgba(0,0,0,0.5)`, fontFamily:"Georgia, serif" },
  heroSub: { color:P.muted, fontSize:15, margin:0 },
  card: { background:P.surface, border:`1px solid ${P.border}`, borderRadius:16, padding:"20px 18px", marginBottom:16 },
  label: { fontSize:11, color:P.steel, fontWeight:600, letterSpacing:2, display:"block", marginBottom:8, textTransform:"uppercase" },
  input: { width:"100%", background:"rgba(255,255,255,0.05)", border:`1px solid ${P.border}`, borderRadius:8, padding:"12px 14px", color:P.text, fontSize:16, outline:"none", marginBottom:14, boxSizing:"border-box", fontFamily:"inherit" },
  btnPrimary: { background:P.red, border:"none", borderRadius:10, padding:"14px 24px", fontWeight:700, fontSize:15, cursor:"pointer", color:P.white, fontFamily:"inherit" },
  btnSecondary: { background:"rgba(255,255,255,0.07)", border:`1px solid ${P.border}`, borderRadius:8, padding:"8px 16px", fontWeight:600, fontSize:13, cursor:"pointer", color:P.text, fontFamily:"inherit" },
  backBtn: { background:"none", border:"none", color:P.muted, cursor:"pointer", fontSize:13, padding:"0 0 16px", fontFamily:"inherit" },
  divider: { textAlign:"center", margin:"20px 0", color:P.muted, fontSize:13 },
};