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
  tile:    "#F5E6B8",
  tileEdge:"#B8860B",
  tileShadow:"#8B6914",
  brown:   "#3D2B00",
  white:   "#FFFFFF",
  text:    "#e8e8f0",
  muted:   "rgba(255,255,255,0.4)",
  // Board square colors — more distinct
  tw:      "#C0392B", // triple word - bold red
  dw:      "#E8877A", // double word - salmon
  tl:      "#1A5276", // triple letter - deep blue
  dl:      "#5DADE2", // double letter - bright blue
  star:    "#C0392B", // center star
  normal:  "#2C3E50", // normal square - slate
  boardBg: "#1a2530", // board background
  boardBorder: "#34495E",
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
    case "ST": return { bg: P.dw,    label: "★",  color: "rgba(255,255,255,0.9)" };
    default:   return { bg: P.normal, label: "",   color: "transparent" };
  }
}

// ─── Word Validation ──────────────────────────────────────────────────────────
// Local Scrabble dictionary — loaded once, cached in memory
let WORD_SET = null;
let wordSetLoading = null;

async function getWordSet() {
  if (WORD_SET) return WORD_SET;
  if (wordSetLoading) return wordSetLoading;
  wordSetLoading = fetch("/scrabble_dictionary.txt")
    .then(r => r.text())
    .then(text => {
      WORD_SET = new Set(text.split("\n").map(w => w.trim().toUpperCase()).filter(Boolean));
      return WORD_SET;
    });
  return wordSetLoading;
}

async function isValidWord(word) {
  if (!word || word.length < 2) return false;
  const words = await getWordSet();
  return words.has(word.toUpperCase());
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
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  function setViewBoth(v) { setView(v); viewRef.current = v; }

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(u) {
    const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
    if (data) setProfile(data);
    else {
      // Create profile on first login
      const newProfile = { id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Player", avatar_url: u.user_metadata?.avatar_url || null, color: PLAYER_COLORS[Math.floor(Math.random()*PLAYER_COLORS.length)], games_played:0, games_won:0, total_score:0 };
      await supabase.from("profiles").insert(newProfile);
      setProfile(newProfile);
    }
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo: window.location.origin } });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null); setProfile(null);
  }

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
    const name = profile?.name || hostName?.trim() || "Player";
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

  async function joinGame(playerName, customCode) {
    const name = profile?.name || playerName?.trim() || "Player";
    playerName = name;
    const targetGameId = (customCode || gameId || "").toUpperCase().trim();
    if (!playerName.trim()) return notify("Enter your name","error");
    if (!targetGameId) return notify("No game found","error");
    if (targetGameId !== gameId) {
      setGameId(targetGameId);
      gameIdRef.current = targetGameId;
      window.history.pushState({}, "", `?game=${targetGameId}`);
    }
    setLoading(true);
    const { data: gd } = await supabase.from("games").select("*").eq("id", targetGameId).single();
    if (!gd) { notify("Game not found","error"); setLoading(false); return; }
    if (gd.status === "playing") { notify("Game already started","error"); setLoading(false); return; }
    const { data: ep } = await supabase.from("game_players").select("*").eq("game_id", targetGameId);
    if (ep?.length >= 4) { notify("Game is full","error"); setLoading(false); return; }
    const playerId = generateId();
    const position = ep?.length || 0;
    const { drawn, remaining } = drawTiles(gd.bag || [], 7);
    await supabase.from("game_players").insert({ id:playerId, game_id:targetGameId, name:playerName.trim(), color:PLAYER_COLORS[position], rack:drawn, score:0, position });
    await supabase.from("games").update({ bag: remaining }).eq("id", targetGameId);
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

  if (authLoading) return (
    <div style={{ ...styles.root, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:P.muted, fontSize:16 }}>Loading…</div>
    </div>
  );

  if (!user) return <AuthView onSignIn={signInWithGoogle} />;

  return (
    <div style={styles.root}>
      {notification && (
        <div style={{ ...styles.notification, background: notification.type==="error" ? P.red : "#2D7A1F" }}>
          {notification.msg}
        </div>
      )}
      {view==="home"  && <HomeView onCreate={createGame} loading={loading} profile={profile} onSignOut={signOut} onProfile={()=>setViewBoth("profile")} onJoinCode={()=>setViewBoth("join")} />}
      {view==="join"  && <JoinView gameId={gameId} onJoin={joinGame} loading={loading} profile={profile} />}
      {view==="lobby" && game && <LobbyView game={game} players={players} myPlayer={myPlayer} gameId={gameId} onStart={startGame} onBack={leaveGame} notify={notify} />}
      {view==="profile" && <ProfileView profile={profile} setProfile={setProfile} userId={user?.id} onBack={()=>setViewBoth("home")} />}
      {view==="game"  && game && <GameBoard game={game} players={players} myPlayer={myPlayer} gameId={gameId} notify={notify} onBack={leaveGame} />}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({ onCreate, loading, profile, onSignOut, onProfile, onJoinCode }) {
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
        {profile && (
          <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginTop:12 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:profile.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:"#fff", fontSize:14 }}>
              {profile.name?.charAt(0).toUpperCase()}
            </div>
            <span style={{ color:P.text, fontWeight:600 }}>{profile.name}</span>
            <button style={{ ...styles.btnSecondary, fontSize:12, padding:"4px 10px" }} onClick={onProfile}>Edit Profile</button>
            <button style={{ ...styles.btnSecondary, fontSize:12, padding:"4px 10px" }} onClick={onSignOut}>Sign Out</button>
          </div>
        )}
      </div>
      <div style={styles.card}>
        <button style={{ ...styles.btnPrimary, width:"100%", opacity:loading?0.6:1 }}
          onClick={()=>onCreate(profile?.name||"Player")} disabled={loading}>
          {loading ? "Creating…" : "Create New Game"}
        </button>
      </div>
      <div style={styles.divider}><span>or</span></div>
      <div style={styles.card}>
        <button style={{ ...styles.btnSecondary, width:"100%", fontSize:15 }} onClick={onJoinCode}>
          Join with Game Code
        </button>
      </div>
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
  const [placed, setPlaced] = useState({});
  const [selectedTile, setSelectedTile] = useState(null);
  const [wordStatus, setWordStatus] = useState({});
  const [wordValidations, setWordValidations] = useState([]); // key -> { valid, score, word }
  const [dragTile, setDragTile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [scores, setScores] = useState({});
  const [gameOver, setGameOver] = useState(false);
  const [swapMode, setSwapMode] = useState(false);
  const [swapSelected, setSwapSelected] = useState([]);
  const [blankPicker, setBlankPicker] = useState(null); // { row, col } pending blank placement
  const [blankAssignments, setBlankAssignments] = useState({}); // key -> letter chosen for blank
  const isMyTurn = game.current_player === myPlayer?.id;

  // Shot clock — 5 min per turn, auto-pass when expired
  const [shotClock, setShotClock] = useState(null);
  const prevTurnPlayerRef = useRef(null);

  useEffect(() => {
    if (game.current_player === myPlayer?.id && prevTurnPlayerRef.current !== game.current_player) {
      playSound("turn");
      setShotClock(300);
    }
    if (game.current_player !== myPlayer?.id) setShotClock(null);
    prevTurnPlayerRef.current = game.current_player;
  }, [game.current_player]);

  useEffect(() => {
    if (shotClock === null) return;
    if (shotClock <= 0) { passTurn(); setShotClock(null); return; }
    const t = setTimeout(() => setShotClock(s => s !== null ? s-1 : null), 1000);
    return () => clearTimeout(t);
  }, [shotClock]);

  // Load my rack from players — only update if not mid-play
  useEffect(() => {
    const me = players.find(p => p.id === myPlayer?.id);
    if (me?.rack && Object.keys(placed).length === 0) {
      setMyRack(me.rack);
    }
  }, [players]);

  // Validate words as tiles are placed
  useEffect(() => {
    if (Object.keys(placed).length === 0) { setWordStatus({}); return; }
    const words = getPlacedWords();
    if (words.length === 0) return;
    const statusMap = {};
    Promise.all(words.map(async ({ word, squares }) => {
      const valid = await isValidWord(word);
      const score = calculateScore();
      squares.forEach(({ r, c }) => {
        statusMap[`${r},${c}`] = { valid, word, score };
      });
    })).then(() => setWordStatus(statusMap));
  }, [placed, blankAssignments]);

  // Track last move for highlighting
  const [lastMoveSquares, setLastMoveSquares] = useState(new Set());

  // Sync board from game
  useEffect(() => {
    if (game.board) {
      // Find new squares vs previous board
      const newSquares = new Set();
      Object.keys(game.board).forEach(k => { if (!board[k]) newSquares.add(k); });
      if (newSquares.size > 0) setLastMoveSquares(newSquares);
      setBoard(game.board);
    }
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
    if (Object.keys(placed).length === 0) setLastMoveSquares(new Set()); // clear highlight on first placement
    if (board[key]) return; // already has permanent tile
    if (placed[key]) {
      // Remove tile back to rack
      const tile = placed[key];
      const newRack = [...myRack];
      newRack.push(tile.letter);
      setMyRack(newRack);
      const newPlaced = { ...placed };
      delete newPlaced[key];
      setPlaced(newPlaced);
      // Clear blank assignment
      const newBA = { ...blankAssignments };
      delete newBA[key];
      setBlankAssignments(newBA);
      setSelectedTile(null);
      return;
    }
    if (selectedTile !== null) {
      const letter = myRack[selectedTile];
      const newRack = [...myRack];
      newRack.splice(selectedTile, 1);
      setMyRack(newRack);
      const newPlacedState = { ...placed, [key]: { letter } };
      setPlaced(newPlacedState);
      setSelectedTile(null);
      playSound("place");
      if (letter === "_") setTimeout(() => setBlankPicker({ row, col }), 50);
    }
  }

  function handleTileClick(idx) {
    setSelectedTile(selectedTile === idx ? null : idx);
  }

  function handleDragStart(idx) {
    setDragTile({ fromRack: true, idx });
    setSelectedTile(idx);
  }

  function shuffleRack() {
    setMyRack(prev => [...prev].sort(() => Math.random() - 0.5));
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
    playSound("place");
    if (letter === "_") setTimeout(() => setBlankPicker({ row, col }), 50);
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
    playSound("recall");
  }

  function getPlacedWords() {
    const allTiles = { ...board };
    Object.entries(placed).forEach(([key, t]) => {
      // Use assigned letter for blanks
      allTiles[key] = t.letter === "_" ? (blankAssignments[key] || "A") : t.letter;
    });
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

  function getTileEffectiveLetter(key) {
    // For blank tiles, use the assigned letter (but scores 0)
    if (placed[key]?.letter === "_") return blankAssignments[key] || "A";
    if (board[key]) return board[key] === "_" ? "A" : board[key];
    return placed[key]?.letter || "";
  }

  function calculateScore() {
    const words = getPlacedWords();
    let total = 0;
    words.forEach(({ squares }) => {
      let wordScore = 0;
      let wordMult = 1;
      squares.forEach(({ r, c }) => {
        const key = `${r},${c}`;
        const isNew = !!placed[key];
        const letter = placed[key]?.letter === "_" ? "_" : (placed[key]?.letter || board[key]);
        // Blank tiles always score 0
        const letterVal = letter === "_" ? 0 : (TILE_VALUES[letter] || 0);
        const squareType = BOARD_LAYOUT[r][c];
        if (isNew) {
          // Apply letter multipliers first
          if (squareType === "TL") wordScore += letterVal * 3;
          else if (squareType === "DL") wordScore += letterVal * 2;
          else wordScore += letterVal;
          // Collect word multipliers
          if (squareType === "TW") wordMult *= 3;
          else if (squareType === "ST") wordMult *= 2;
          else if (squareType === "DW") wordMult *= 2;
        } else {
          wordScore += letterVal;
        }
      });
      total += wordScore * wordMult;
    });
    if (Object.keys(placed).length === 7) total += 50;
    return total;
  }

  function toggleSwapSelect(idx) {
    setSwapSelected(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  }

  async function confirmSwap() {
    if (swapSelected.length === 0) return notify("Select tiles to swap","error");
    const { data: gameData } = await supabase.from("games").select("bag").eq("id",gameId).single();
    const bag = gameData?.bag || [];
    if (bag.length < swapSelected.length) return notify("Not enough tiles in bag","error");
    // Draw new tiles
    const { drawn, remaining } = drawTiles(bag, swapSelected.length);
    // Put selected tiles back in bag (shuffled)
    const returnedTiles = swapSelected.map(idx => myRack[idx]);
    const newBag = [...remaining, ...returnedTiles].sort(() => Math.random() - 0.5);
    // Build new rack
    const newRack = myRack.filter((_, idx) => !swapSelected.includes(idx));
    newRack.push(...drawn);
    // Next player
    const myIdx = players.findIndex(p=>p.id===myPlayer?.id);
    const nextIdx = (myIdx+1)%players.length;
    await supabase.from("games").update({ bag:newBag, current_player:players[nextIdx].id, turn_number:(game.turn_number||0)+1 }).eq("id",gameId);
    await supabase.from("game_players").update({ rack:newRack }).eq("id",myPlayer?.id);
    await supabase.from("moves").insert({ id:generateId(), game_id:gameId, player_id:myPlayer?.id, tiles_placed:{}, words_formed:[], score:0, move_type:"swap" });
    setMyRack(newRack);
    const swapCount = swapSelected.length;
    setSwapMode(false);
    setSwapSelected([]);
    notify(`Swapped ${swapCount} tile${swapCount!==1?"s":""}!`);
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
    playSound("play");
    if (newRack.length === 0 && remaining.length === 0) {
      await supabase.from("games").update({ status:"finished" }).eq("id",gameId);
    }
  }

  async function passTurn() {
    setShotClock(null);
    const myIdx = players.findIndex(p=>p.id===myPlayer?.id);
    const nextIdx = (myIdx+1)%players.length;
    await supabase.from("moves").insert({ id:generateId(), game_id:gameId, player_id:myPlayer?.id, tiles_placed:{}, words_formed:[], score:0, move_type:"pass" });
    // Check consecutive passes — if all players passed twice, end game
    const { data: recentMoves } = await supabase.from("moves")
      .select("move_type").eq("game_id",gameId)
      .order("created_at",{ascending:false}).limit(players.length*2);
    const allPassed = recentMoves && recentMoves.length >= players.length*2 &&
      recentMoves.every(m=>m.move_type==="pass");
    if (allPassed) {
      await supabase.from("games").update({ status:"finished" }).eq("id",gameId);
    } else {
      await supabase.from("games").update({ current_player:players[nextIdx].id, turn_number:(game.turn_number||0)+1 }).eq("id",gameId);
    }
    notify("Turn passed");
  }

  const CELL = 42;

  const [showResign, setShowResign] = useState(false);
  const [soundOn, setSoundOn] = useState(localStorage.getItem("scrabbleSoundOff") !== "true");

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("scrabbleSoundOff", next ? "false" : "true");
  }

  // Compute remaining tiles in bag
  const bagCounts = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("").forEach(l => { bagCounts[l] = 0; });
  (game.bag || []).forEach(l => { if (bagCounts[l] !== undefined) bagCounts[l]++; });

  async function resign() {
    await supabase.from("games").update({ status:"finished" }).eq("id",gameId);
    await supabase.from("moves").insert({ id:generateId(), game_id:gameId, player_id:myPlayer?.id, tiles_placed:{}, words_formed:[], score:0, move_type:"resign" });
  }

  // Watch for game finished
  useEffect(() => {
    if (game.status === "finished") {
      notify(`Game over! ${players.sort((a,b)=>(scores[b.id]||0)-(scores[a.id]||0))[0]?.name} wins!`);
      setTimeout(() => onBack(), 3000);
    }
  }, [game.status]);

  return (
    <div style={{ minHeight:"100vh", background:P.bg, fontFamily:"'Segoe UI', sans-serif" }}>
      {/* Blank tile letter picker */}
      {blankPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div style={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:16, padding:24, maxWidth:360, width:"90%" }}>
            <div style={{ fontSize:16, fontWeight:700, color:P.text, marginBottom:4, textAlign:"center" }}>Choose a letter for blank tile</div>
            <div style={{ fontSize:12, color:P.muted, textAlign:"center", marginBottom:16 }}>Blank tiles score 0 points</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:6 }}>
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                <button key={l} onClick={() => {
                  const key = `${blankPicker.row},${blankPicker.col}`;
                  setBlankAssignments(prev => ({ ...prev, [key]: l }));
                  setBlankPicker(null);
                }} style={{ width:"100%", aspectRatio:"1", background:P.tile, border:`1px solid ${P.tileEdge}`, borderRadius:6, fontWeight:800, fontSize:16, color:P.brown, cursor:"pointer", fontFamily:"'Segoe UI', sans-serif", boxShadow:`inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 0 ${P.tileEdge}` }}>
                  {l}
                </button>
              ))}
            </div>
            <button style={{ ...styles.btnSecondary, width:"100%", marginTop:12 }} onClick={() => {
              // Cancel — return blank to rack
              const key = `${blankPicker.row},${blankPicker.col}`;
              const newPlaced = { ...placed };
              if (newPlaced[key]) {
                setMyRack(prev => [...prev, "_"]);
                delete newPlaced[key];
                setPlaced(newPlaced);
              }
              setBlankPicker(null);
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Resign confirm modal */}
      {showResign && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
          <div style={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:16, padding:28, maxWidth:320, textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:700, color:P.text, marginBottom:8 }}>Resign game?</div>
            <div style={{ fontSize:14, color:P.muted, marginBottom:24 }}>This will end the game for everyone.</div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button style={styles.btnSecondary} onClick={()=>setShowResign(false)}>Cancel</button>
              <button style={{ ...styles.btnPrimary, background:P.red }} onClick={resign}>Resign</button>
            </div>
          </div>
        </div>
      )}



      {/* Header */}
      <div style={{ background:P.surface, borderBottom:`1px solid ${P.border}`, padding:"10px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <button style={styles.backBtn} onClick={onBack}>← Leave</button>
        <div style={{ flex:1 }} />
        {players.map(p => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:20, background:game.current_player===p.id?`${p.color}22`:"transparent", border:game.current_player===p.id?`1px solid ${p.color}`:"1px solid transparent" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:p.color }} />
            <span style={{ fontSize:13, fontWeight:game.current_player===p.id?700:400, color:P.text }}>{p.name}</span>
            <span style={{ fontSize:13, fontWeight:700, color:P.gold }}>{scores[p.id]||0}</span>
          </div>
        ))}
        {shotClock !== null && (
          <div style={{ fontSize:13, fontWeight:700, color:shotClock<=30?P.red:P.gold, minWidth:48, textAlign:"center" }}>
            ⏱ {Math.floor(shotClock/60)}:{String(shotClock%60).padStart(2,"0")}
          </div>
        )}
        <button style={{ ...styles.btnSecondary, fontSize:12, padding:"6px 12px" }} onClick={toggleSound}>
          {soundOn ? "🔊" : "🔇"}
        </button>
        <button style={{ ...styles.btnSecondary, fontSize:12, padding:"6px 12px", borderColor:P.red, color:P.red }} onClick={()=>setShowResign(true)}>
          🏳 Resign
        </button>
      </div>

      <div style={{ display:"flex", gap:12, padding:"12px 8px", justifyContent:"center", alignItems:"flex-start", flexWrap:"wrap" }}>
        {/* Tile Bag Sidebar */}
        <div style={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:12, padding:"12px 10px", minWidth:130, flexShrink:0 }}>
          <div style={{ fontSize:10, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:10, textAlign:"center" }}>
            TILE BAG ({(game.bag||[]).length})
            <div style={{ fontSize:9, color:P.muted, fontWeight:400 }}>+ {players.reduce((a,p)=>(p.rack||[]).length+a,0)} in hands</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:4 }}>
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("").map(l => (
              <div key={l} style={{ background:bagCounts[l]>0?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.02)", border:`1px solid ${bagCounts[l]>0?P.border:"rgba(255,255,255,0.03)"}`, borderRadius:5, padding:"4px 2px", textAlign:"center", opacity:bagCounts[l]>0?1:0.3 }}>
                <div style={{ fontSize:11, fontWeight:800, color:bagCounts[l]>0?P.text:P.muted, fontFamily:"'Segoe UI', sans-serif" }}>{l}</div>
                <div style={{ fontSize:10, color:P.gold, fontWeight:700 }}>{bagCounts[l]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Board + Rack column */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
          {/* Turn indicator — subtle colored bar only */}
          <div style={{ marginBottom:8, height:3, width:"100%", borderRadius:2, background:isMyTurn?P.gold:P.border, transition:"background 0.3s", maxWidth:600 }} />

          {/* Board */}
        <div style={{ position:"relative" }}>
          {/* Floating word validation labels */}
          {wordValidations.map(({ word, squares, valid, score }, wi) => {
            if (squares.length === 0) return null;
            const minR = Math.min(...squares.map(s=>s.r));
            const minC = Math.min(...squares.map(s=>s.c));
            const maxC = Math.max(...squares.map(s=>s.c));
            const CELL = 42;
            const left = minC * (CELL+1) + 3;
            const top = minR * (CELL+1) + 3 - 22;
            const width = (maxC - minC + 1) * (CELL+1) - 1;
            return (
              <div key={wi} style={{ position:"absolute", left, top, width, zIndex:20, pointerEvents:"none",
                background: valid ? "rgba(39,174,96,0.9)" : "rgba(226,29,56,0.9)",
                borderRadius:4, padding:"2px 6px", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, fontWeight:700, color:"#fff", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }}>
                <span>{word}</span>
                {valid && <span>+{score}</span>}
                {!valid && <span>✗</span>}
              </div>
            );
          })}
        <div style={{ border:"2px solid #34495E", borderRadius:8, overflow:"auto", maxWidth:"100vw", boxShadow:"0 8px 32px rgba(0,0,0,0.7)", background:"#1a2530" }}>
          <div style={{ display:"grid", gridTemplateColumns:`repeat(15, ${CELL}px)`, gridTemplateRows:`repeat(15, ${CELL}px)`, gap:1, background:"#1a2530", padding:3 }}>
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
                    style={{ width:CELL, height:CELL, background:permanentTile||placedTile?"#F5E6B8":sq.bg, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", position:"relative", fontSize:11, fontWeight:900, color:sq.color, borderRadius:3, transition:"all 0.15s",
                      outline: placedTile ? `2px solid ${wordStatus[key]?.valid===true?"#27AE60":wordStatus[key]?.valid===false?"#E21D38":P.gold}` : "none",
                      boxShadow: placedTile && wordStatus[key]?.valid===true ? "0 0 8px rgba(39,174,96,0.4)" : placedTile && wordStatus[key]?.valid===false ? "0 0 8px rgba(226,29,56,0.4)" : placedTile ? `0 0 8px ${P.gold}44` : "none",
                      letterSpacing:-0.5 }}
                    onClick={() => handleSquareClick(r,c)}
                    onDragOver={handleDragOver}
                    onDrop={(e)=>handleDropOnSquare(e,r,c)}
                    draggable={!!placedTile}
                    onDragStart={placedTile ? ()=>handleDragFromBoard(r,c) : undefined}
                  >
                    {permanentTile ? (
                      <div style={{ width:CELL-4, height:CELL-4, background:lastMoveSquares.has(key)?"#E8F5E9":P.tile, borderRadius:3, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:`1px solid ${lastMoveSquares.has(key)?"#27AE60":P.tileEdge}`, boxShadow:lastMoveSquares.has(key)?`0 0 6px rgba(39,174,96,0.5), inset 0 1px 0 rgba(255,255,255,0.5)`:`inset 0 1px 0 rgba(255,255,255,0.5)` }}>
                        <span style={{ fontSize:15, fontWeight:800, color:"#888", fontFamily:"'Segoe UI', Arial, sans-serif", lineHeight:1, fontStyle:permanentTile==="_"?"italic":"normal" }}>
                          {permanentTile==="_" ? (board[key+"_letter"]||"") : permanentTile}
                        </span>
                        <span style={{ fontSize:7, color:P.brown, lineHeight:1, fontWeight:700 }}>{TILE_VALUES[permanentTile]||""}</span>
                      </div>
                    ) : placedTile ? (
                      <div style={{ width:CELL-4, height:CELL-4, background:"#FFF3CC", borderRadius:3, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", border:`1px solid ${placedTile.letter==="_"&&!blankAssignments[key]?"#E21D38":P.gold}`, boxShadow:`inset 0 1px 0 rgba(255,255,255,0.7), 0 0 6px ${P.gold}66` }} onClick={()=>{ if(placedTile.letter==="_"&&!blankAssignments[key]){ setBlankPicker({row:r,col:c}); return; } handleSquareClick(r,c); }}>
                        <span style={{ fontSize:15, fontWeight:800, color:placedTile.letter==="_"&&!blankAssignments[key]?P.red:P.brown, fontFamily:"'Segoe UI', Arial, sans-serif", lineHeight:1 }}>
                          {placedTile.letter==="_" ? (blankAssignments[key]||"?") : placedTile.letter}
                        </span>
                        <span style={{ fontSize:7, color:P.brown, lineHeight:1, fontWeight:700 }}>{placedTile.letter==="_"?"0":TILE_VALUES[placedTile.letter]||""}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:11, color:sq.color, fontWeight:900, letterSpacing:-0.5 }}>{sq.label}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>

        {/* Rack */}
        <div style={{ marginTop:16, background:P.surface, border:`1px solid ${P.border}`, borderRadius:12, padding:"12px 16px", width:"100%", maxWidth:600 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2 }}>YOUR RACK</div>
            <div />
          </div>
          <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
            {myRack.map((letter, idx) => {
              const isSwapSel = swapSelected.includes(idx);
              const isPlaceSel = selectedTile === idx;
              return (
                <div key={idx}
                  draggable={!swapMode}
                  onDragStart={!swapMode ? (e)=>{ e.dataTransfer.effectAllowed="move"; handleDragStart(idx); } : undefined}
                  onClick={()=>{ if (swapMode) toggleSwapSelect(idx); else handleTileClick(idx); }}
                  style={{ width:48, height:48, background:isSwapSel?"#555":P.tile, borderRadius:5, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"grab",
                    border:`1px solid ${isSwapSel?P.red:isPlaceSel?P.gold:P.tileEdge}`,
                    boxShadow:isSwapSel?`inset 0 1px 0 rgba(255,255,255,0.2), 0 0 0 2px ${P.red}, 0 4px 0 #444`:isPlaceSel?`inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 2px ${P.gold}, 0 4px 0 ${P.tileShadow}`:`inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 ${P.tileEdge}, 0 4px 0 ${P.tileShadow}`,
                    transform:isSwapSel||isPlaceSel?"translateY(-5px)":"none", transition:"all 0.1s",
                    opacity:!swapMode&&selectedTile!==null&&!isPlaceSel?0.5:1 }}>
                  <span style={{ fontSize:letter==="_"?16:20, fontWeight:800, color:isSwapSel?"#aaa":P.brown, fontFamily:"'Segoe UI', Arial, sans-serif", lineHeight:1 }}>{letter==="_"?"★":letter}</span>
                  <span style={{ fontSize:9, color:isSwapSel?"#aaa":P.brown, fontWeight:700 }}>{TILE_VALUES[letter]||""}</span>
                </div>
              );
            })}
            {myRack.length === 0 && <span style={{ color:P.muted, fontSize:13 }}>No tiles remaining</span>}
          </div>

          <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
            {/* Shuffle — always available */}
            {!swapMode && Object.keys(placed).length === 0 && (
              <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={shuffleRack}>🔀 Shuffle</button>
            )}
            {/* When tiles placed — show score preview + recall always, play only on your turn */}
            {!swapMode && Object.keys(placed).length > 0 && (
              <>
                <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={recallTiles}>Recall</button>
                <div style={{ fontSize:13, color:wordValidations.length>0&&wordValidations.every(w=>w.valid)?P.gold:P.red, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                  {wordValidations.length>0&&wordValidations.every(w=>w.valid)?`+${calculateScore()} pts`:"Invalid word"}
                </div>
                {isMyTurn && (
                  <button style={{ ...styles.btnPrimary, fontSize:13, padding:"8px 20px",
                    opacity:(validating||wordValidations.length===0||wordValidations.some(w=>!w.valid))?0.4:1 }}
                    onClick={submitPlay}
                    disabled={validating||wordValidations.length===0||wordValidations.some(w=>!w.valid)}>
                    {validating?"Checking…":"Play Word"}
                  </button>
                )}
              </>
            )}
            {/* Pass/Swap — only on your turn */}
            {isMyTurn && !swapMode && Object.keys(placed).length === 0 && (
              <>
                <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={()=>setSwapMode(true)}>Swap</button>
                <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={()=>setShowPassConfirm(true)}>Pass</button>
              </>
            )}
            {swapMode && (
              <>
                <div style={{ width:"100%", textAlign:"center", fontSize:12, color:P.muted, marginBottom:4 }}>
                  Select tiles to swap ({swapSelected.length} selected)
                </div>
                <button style={{ ...styles.btnSecondary, fontSize:13 }} onClick={()=>{ setSwapMode(false); setSwapSelected([]); }}>Cancel</button>
                <button style={{ ...styles.btnPrimary, fontSize:13, padding:"8px 20px", opacity:swapSelected.length===0?0.4:1 }}
                  onClick={confirmSwap} disabled={swapSelected.length===0}>
                  Confirm Swap
                </button>
              </>
            )}
          </div>
        </div>

        </div>
        {/* Right sidebar — scores + move history */}
        <div style={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:12, padding:"12px 10px", width:160, flexShrink:0 }}>
          <div style={{ fontSize:10, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:10, textAlign:"center" }}>SCORES</div>
          {players.map((p) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 6px", borderRadius:8, marginBottom:4, background:game.current_player===p.id?`${p.color}22`:"transparent", border:game.current_player===p.id?`1px solid ${p.color}33`:"1px solid transparent" }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:p.color, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:P.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
                {game.current_player===p.id && <div style={{ fontSize:9, color:p.color }}>● your turn</div>}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:P.gold }}>{scores[p.id]||0}</div>
            </div>
          ))}
          <div style={{ marginTop:12, borderTop:`1px solid ${P.border}`, paddingTop:10 }}>
            <div style={{ fontSize:10, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:8 }}>MOVES</div>
            <MoveHistory gameId={gameId} players={players} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MOVE HISTORY ─────────────────────────────────────────────────────────────
function MoveHistory({ gameId, players, compact }) {
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

  if (moves.length === 0) return compact ? <div style={{ fontSize:11, color:P.muted }}>No moves yet</div> : null;

  const moveList = moves.map(m => {
    const player = players.find(p=>p.id===m.player_id);
    return (
      <div key={m.id} style={{ padding:compact?"4px 0":"6px 0", borderBottom:"1px solid rgba(255,255,255,0.05)", fontSize:compact?11:13 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:player?.color||P.muted, flexShrink:0 }} />
          <span style={{ color:P.text, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:compact?70:120 }}>{player?.name}</span>
          {m.move_type==="pass" ? <span style={{ color:P.muted }}>pass</span>
          : m.move_type==="swap" ? <span style={{ color:P.muted }}>swap</span>
          : m.move_type==="resign" ? <span style={{ color:P.red }}>resign</span>
          : <span style={{ color:P.gold, fontWeight:700, marginLeft:"auto" }}>+{m.score}</span>}
        </div>
        {m.move_type==="play" && <div style={{ fontSize:10, color:P.muted, paddingLeft:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(m.words_formed||[]).join(", ")}</div>}
      </div>
    );
  });

  if (compact) return <div>{moveList}</div>;

  return (
    <div style={{ marginTop:16, width:"100%", maxWidth:600 }}>
      <div style={styles.card}>
        <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:10 }}>RECENT MOVES</div>
        {moveList}
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
  heroTile: { width:44, height:44, background:P.tile, borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:22, color:P.brown, boxShadow:`inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 ${P.tileEdge}, 0 4px 8px rgba(0,0,0,0.5)`, fontFamily:"'Segoe UI', Arial, sans-serif", border:`1px solid ${P.tileEdge}` },
  heroSub: { color:P.muted, fontSize:15, margin:0 },
  card: { background:P.surface, border:`1px solid ${P.border}`, borderRadius:16, padding:"20px 18px", marginBottom:16 },
  label: { fontSize:11, color:P.steel, fontWeight:600, letterSpacing:2, display:"block", marginBottom:8, textTransform:"uppercase" },
  input: { width:"100%", background:"rgba(255,255,255,0.05)", border:`1px solid ${P.border}`, borderRadius:8, padding:"12px 14px", color:P.text, fontSize:16, outline:"none", marginBottom:14, boxSizing:"border-box", fontFamily:"inherit" },
  btnPrimary: { background:P.red, border:"none", borderRadius:10, padding:"14px 24px", fontWeight:700, fontSize:15, cursor:"pointer", color:P.white, fontFamily:"inherit" },
  btnSecondary: { background:"rgba(255,255,255,0.07)", border:`1px solid ${P.border}`, borderRadius:8, padding:"8px 16px", fontWeight:600, fontSize:13, cursor:"pointer", color:P.text, fontFamily:"inherit" },
  backBtn: { background:"none", border:"none", color:P.muted, cursor:"pointer", fontSize:13, padding:"0 0 16px", fontFamily:"inherit" },
  divider: { textAlign:"center", margin:"20px 0", color:P.muted, fontSize:13 },
};

// ─── AUTH VIEW ────────────────────────────────────────────────────────────────
function AuthView({ onSignIn }) {
  return (
    <div style={{ ...styles.root, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <div style={{ textAlign:"center", maxWidth:400, padding:32 }}>
        <div style={styles.heroTiles}>
          {"SCRABBLE".split("").map((l,i) => <div key={i} style={styles.heroTile}>{l}</div>)}
        </div>
        <p style={{ color:P.muted, marginBottom:32, fontSize:15 }}>Sign in to play, track your stats and history</p>
        <button onClick={onSignIn} style={{ display:"flex", alignItems:"center", gap:12, background:P.white, border:"none", borderRadius:10, padding:"14px 24px", fontSize:15, fontWeight:700, color:"#1a1a1a", cursor:"pointer", margin:"0 auto", boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.5 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.8 18.9 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.5 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.1l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.5 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.2 5.2C37 37.6 44 32 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({ profile, setProfile, userId, onBack }) {
  const [name, setName] = useState(profile?.name || "");
  const [color, setColor] = useState(profile?.color || PLAYER_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [games, setGames] = useState([]);

  useEffect(() => {
    supabase.from("moves").select("game_id, score, words_formed, created_at")
      .eq("player_id", userId).order("created_at", { ascending:false }).limit(20)
      .then(({ data }) => { if (data) setGames(data); });
  }, [userId]);

  async function save() {
    setSaving(true);
    const updated = { ...profile, name: name.trim(), color };
    await supabase.from("profiles").update({ name:name.trim(), color }).eq("id", userId);
    setProfile(updated);
    setSaving(false);
    onBack();
  }

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← Back</button>
      <h1 style={{ fontSize:28, fontWeight:900, color:P.text, marginBottom:4 }}>Profile</h1>

      <div style={styles.card}>
        {/* Avatar */}
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
          <div style={{ width:64, height:64, borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:900, color:"#fff", boxShadow:`0 4px 16px ${color}66` }}>
            {(name||"P").charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:P.text }}>{name || "Player"}</div>
            <div style={{ fontSize:13, color:P.muted }}>Scrabble Player</div>
          </div>
        </div>
        <label style={styles.label}>Display Name</label>
        <input style={styles.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" />
        <label style={styles.label}>Color</label>
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          {[...PLAYER_COLORS, "#8E44AD","#16A085","#D35400","#7F8C8D"].map(c => (
            <div key={c} onClick={()=>setColor(c)} style={{ width:32, height:32, borderRadius:"50%", background:c, cursor:"pointer", border:color===c?`3px solid ${P.white}`:"3px solid transparent", boxShadow:color===c?`0 0 0 2px ${c}`:"none", transition:"all 0.15s" }} />
          ))}
        </div>
        <button style={{ ...styles.btnPrimary, width:"100%", opacity:saving?0.6:1 }} onClick={save} disabled={saving}>
          {saving?"Saving…":"Save Profile"}
        </button>
      </div>

      {/* Stats */}
      <div style={styles.card}>
        <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:12 }}>STATS</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {[
            { label:"Games", value: profile?.games_played || 0 },
            { label:"Wins", value: profile?.games_won || 0 },
            { label:"Avg Score", value: profile?.games_played ? Math.round((profile?.total_score||0)/profile.games_played) : 0 },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"12px 8px" }}>
              <div style={{ fontSize:28, fontWeight:900, color:P.gold }}>{s.value}</div>
              <div style={{ fontSize:11, color:P.muted, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent moves */}
      {games.length > 0 && (
        <div style={styles.card}>
          <div style={{ fontSize:11, color:P.steel, fontWeight:700, letterSpacing:2, marginBottom:12 }}>RECENT PLAYS</div>
          {games.slice(0,10).map((m,i) => (
            <div key={i} style={{ display:"flex", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.05)", fontSize:13 }}>
              <span style={{ color:P.text }}>{(m.words_formed||[]).join(", ") || "—"}</span>
              <span style={{ color:P.gold, fontWeight:700, marginLeft:"auto" }}>+{m.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}