import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://xlzeuduftbvedjisfbip.supabase.co",
  "sb_publishable_fvIHoyum37kgBpfnSjIp6w_vzrG25At"
);

// ─── Palette ──────────────────────────────────────────────────────────────────
const P = {
  green:   "#2D5016",
  felt:    "#3B7A2A",
  lightFelt:"#4A9235",
  gold:    "#C9A84C",
  cream:   "#F5EDD6",
  brown:   "#6B4226",
  tile:    "#F2E8C4",
  tileShadow:"#D4C098",
  white:   "#FFFFFF",
  dark:    "#1A1A1A",
  red:     "#C0392B",
};

const PLAYER_COLORS = ["#2980B9","#C0392B","#8E44AD","#27AE60"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildShareLink(gameId) {
  return `${window.location.origin}${window.location.pathname}?game=${gameId}`;
}

function getGameIdFromUrl() {
  return new URLSearchParams(window.location.search).get("game");
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myPlayer, setMyPlayer] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);

  // Check for ?game= in URL
  useEffect(() => {
    const id = getGameIdFromUrl();
    if (id) {
      setGameId(id);
      setView("join");
    }
  }, []);

  // Subscribe to game and player changes
  useEffect(() => {
    if (!gameId) return;

    // Load initial data
    loadGame(gameId);

    // Real-time subscription
    const gameChannel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        (payload) => { if (payload.new) setGame(payload.new); }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
        () => { loadPlayers(gameId); }
      )
      .subscribe();

    return () => { supabase.removeChannel(gameChannel); };
  }, [gameId]);

  async function loadGame(id) {
    const { data } = await supabase.from("games").select("*").eq("id", id).single();
    if (data) setGame(data);
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
    if (!hostName.trim()) return notify("Enter your name", "error");
    setLoading(true);
    const id = generateId();
    const playerId = generateId();

    await supabase.from("games").insert({
      id, status: "waiting", board: {}, bag: [], current_player: null, turn_number: 0
    });

    await supabase.from("game_players").insert({
      id: playerId, game_id: id, name: hostName.trim(),
      color: PLAYER_COLORS[0], rack: [], score: 0, position: 0
    });

    setGameId(id);
    setMyPlayer({ id: playerId, name: hostName.trim(), color: PLAYER_COLORS[0] });
    window.history.pushState({}, "", `?game=${id}`);
    setLoading(false);
    setView("lobby");
  }

  async function joinGame(playerName) {
    if (!playerName.trim()) return notify("Enter your name", "error");
    if (!gameId) return notify("No game found", "error");
    setLoading(true);

    // Check game exists and has room
    const { data: gameData } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (!gameData) { notify("Game not found", "error"); setLoading(false); return; }
    if (gameData.status === "playing") { notify("Game already started", "error"); setLoading(false); return; }

    const { data: existingPlayers } = await supabase.from("game_players").select("*").eq("game_id", gameId);
    if (existingPlayers?.length >= 4) { notify("Game is full (max 4 players)", "error"); setLoading(false); return; }

    const playerId = generateId();
    const position = existingPlayers?.length || 0;
    const color = PLAYER_COLORS[position];

    await supabase.from("game_players").insert({
      id: playerId, game_id: gameId, name: playerName.trim(),
      color, rack: [], score: 0, position
    });

    setMyPlayer({ id: playerId, name: playerName.trim(), color });
    setGame(gameData);
    setLoading(false);
    setView("lobby");
  }

  async function startGame() {
    if (players.length < 2) return notify("Need at least 2 players", "error");
    await supabase.from("games").update({
      status: "playing",
      current_player: players[0]?.id,
    }).eq("id", gameId);
    setView("game");
  }

  return (
    <div style={styles.root}>
      {notification && (
        <div style={{ ...styles.notification, background: notification.type === "error" ? P.red : P.lightFelt }}>
          {notification.msg}
        </div>
      )}
      {view === "home"  && <HomeView onCreate={createGame} loading={loading} />}
      {view === "join"  && <JoinView gameId={gameId} onJoin={joinGame} loading={loading} />}
      {view === "lobby" && game && <LobbyView game={game} players={players} myPlayer={myPlayer} gameId={gameId} onStart={startGame} onBack={()=>{ setView("home"); setGameId(null); setGame(null); setPlayers([]); window.history.pushState({}, "", window.location.pathname); }} notify={notify} />}
      {view === "game"  && game && <GameBoard game={game} players={players} myPlayer={myPlayer} gameId={gameId} onBack={()=>setView("home")} />}
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
          {"SCRABBLE".split("").map((l, i) => (
            <div key={i} style={{ ...styles.heroTile, animationDelay: `${i * 0.1}s` }}>{l}</div>
          ))}
        </div>
        <p style={styles.heroSub}>Up to 4 players · Real-time · Full rules</p>
      </div>

      <div style={styles.card}>
        <label style={styles.label}>Your name</label>
        <input
          style={styles.input}
          placeholder="Enter your name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onCreate(name)}
          autoFocus
        />
        <button
          style={{ ...styles.btnPrimary, width: "100%", opacity: loading ? 0.6 : 1 }}
          onClick={() => onCreate(name)}
          disabled={loading}
        >
          {loading ? "Creating…" : "Create New Game"}
        </button>
      </div>

      <div style={styles.divider}><span>or join with a link</span></div>
      <p style={{ textAlign: "center", color: P.cream, opacity: 0.6, fontSize: 14 }}>
        Ask your host to share the game link with you
      </p>
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
          {"SCRABBLE".split("").map((l, i) => (
            <div key={i} style={{ ...styles.heroTile }}>{l}</div>
          ))}
        </div>
      </div>
      <div style={styles.card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: P.gold, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>JOINING GAME</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: P.cream, fontFamily: "Georgia, serif", letterSpacing: 3 }}>{gameId}</div>
        </div>
        <label style={styles.label}>Your name</label>
        <input
          style={styles.input}
          placeholder="Enter your name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onJoin(name)}
          autoFocus
        />
        <button
          style={{ ...styles.btnPrimary, width: "100%", opacity: loading ? 0.6 : 1 }}
          onClick={() => onJoin(name)}
          disabled={loading}
        >
          {loading ? "Joining…" : "Join Game"}
        </button>
      </div>
    </div>
  );
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
function LobbyView({ game, players, myPlayer, gameId, onStart, onBack, notify }) {
  const [copied, setCopied] = useState(false);
  const isHost = myPlayer?.position === 0 || players[0]?.id === myPlayer?.id;

  function copyLink() {
    navigator.clipboard.writeText(buildShareLink(gameId)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← Leave</button>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 13, color: P.gold, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>GAME LOBBY</div>
        <div style={{ fontSize: 40, fontWeight: 900, color: P.cream, fontFamily: "Georgia, serif", letterSpacing: 6 }}>{gameId}</div>
      </div>

      {/* Share link */}
      <div style={{ ...styles.card, display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ flex: 1, fontSize: 13, color: P.cream, opacity: 0.8 }}>🔗 Share link to invite players</span>
        <button style={styles.btnSecondary} onClick={copyLink}>
          {copied ? "Copied! ✓" : "Copy Link"}
        </button>
      </div>

      {/* Players */}
      <div style={styles.card}>
        <div style={{ fontSize: 12, color: P.gold, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>
          PLAYERS ({players.length}/4)
        </div>
        {players.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < players.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: p.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: P.white, fontSize: 16 }}>
              {p.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: P.cream, fontSize: 16 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: P.gold, opacity: 0.7 }}>{i === 0 ? "Host" : `Player ${i + 1}`}</div>
            </div>
            {p.id === myPlayer?.id && (
              <span style={{ fontSize: 11, color: P.gold, fontWeight: 700, letterSpacing: 1 }}>YOU</span>
            )}
          </div>
        ))}
        {players.length < 4 && (
          <div style={{ padding: "10px 0", opacity: 0.3, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: P.cream }}>+</div>
            <span style={{ color: P.cream, fontSize: 14 }}>Waiting for player…</span>
          </div>
        )}
      </div>

      {isHost && (
        <button
          style={{ ...styles.btnPrimary, width: "100%", marginTop: 24, opacity: players.length < 2 ? 0.4 : 1 }}
          onClick={onStart}
          disabled={players.length < 2}
        >
          {players.length < 2 ? "Need at least 2 players" : "Start Game →"}
        </button>
      )}
      {!isHost && (
        <div style={{ textAlign: "center", color: P.cream, opacity: 0.5, marginTop: 24, fontSize: 14 }}>
          Waiting for host to start the game…
        </div>
      )}
    </div>
  );
}

// ─── GAME BOARD (placeholder for Phase 3) ────────────────────────────────────
function GameBoard({ game, players, myPlayer, gameId, onBack }) {
  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← Leave</button>
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: P.cream, marginBottom: 8 }}>Game in progress</div>
        <div style={{ fontSize: 14, color: P.cream, opacity: 0.6, marginBottom: 32 }}>Board coming in Phase 3!</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300, margin: "0 auto" }}>
          {players.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.05)", padding: "12px 16px", borderRadius: 10, borderLeft: `4px solid ${p.color}` }}>
              <span style={{ flex: 1, color: P.cream, fontWeight: p.id === myPlayer?.id ? 700 : 400 }}>
                {p.name} {p.id === myPlayer?.id ? "(you)" : ""}
              </span>
              <span style={{ color: P.gold, fontWeight: 700 }}>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: `linear-gradient(135deg, ${P.green} 0%, ${P.felt} 50%, ${P.green} 100%)`,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: P.cream,
  },
  page: { maxWidth: 480, margin: "0 auto", padding: "24px 20px 60px" },
  notification: {
    position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
    padding: "10px 24px", borderRadius: 30, fontWeight: 700, fontSize: 14,
    color: P.white, zIndex: 9999,
  },
  hero: { textAlign: "center", padding: "48px 0 40px" },
  heroTiles: { display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 },
  heroTile: {
    width: 44, height: 44, background: P.tile,
    borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 22, color: P.brown,
    boxShadow: `0 3px 0 ${P.tileShadow}, 0 4px 8px rgba(0,0,0,0.3)`,
    fontFamily: "Georgia, serif",
  },
  heroSub: { color: P.cream, opacity: 0.7, fontSize: 15, margin: 0 },
  card: {
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16, padding: "20px 18px", marginBottom: 16,
    backdropFilter: "blur(10px)",
  },
  label: { fontSize: 12, color: P.gold, fontWeight: 700, letterSpacing: 2, display: "block", marginBottom: 8, textTransform: "uppercase" },
  input: {
    width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 8, padding: "12px 14px", color: P.cream, fontSize: 16,
    outline: "none", marginBottom: 14, boxSizing: "border-box", fontFamily: "inherit",
  },
  btnPrimary: {
    background: P.gold, border: "none", borderRadius: 10, padding: "14px 24px",
    fontWeight: 800, fontSize: 15, cursor: "pointer", color: P.brown,
    fontFamily: "inherit", letterSpacing: 0.5,
  },
  btnSecondary: {
    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13,
    cursor: "pointer", color: P.cream, fontFamily: "inherit",
  },
  backBtn: {
    background: "none", border: "none", color: "rgba(255,255,255,0.5)",
    cursor: "pointer", fontSize: 13, padding: "0 0 16px", fontFamily: "inherit",
  },
  divider: {
    textAlign: "center", position: "relative", margin: "20px 0",
    color: "rgba(255,255,255,0.3)", fontSize: 13,
  },
};