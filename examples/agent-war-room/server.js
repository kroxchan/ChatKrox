import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import multer from "multer";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENCLAW_DEFAULT_BIN = process.platform === "win32" ? "openclaw.cmd" : "openclaw";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || OPENCLAW_DEFAULT_BIN;
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || "main";
const OPENCLAW_FALLBACK_AGENT_ID = process.env.OPENCLAW_FALLBACK_AGENT_ID || "rescue";
const OPENCLAW_TIMEOUT_SEC = Number(process.env.OPENCLAW_TIMEOUT_SEC || 45);
const OPENCLAW_FAST_TIMEOUT_SEC = Number(process.env.OPENCLAW_FAST_TIMEOUT_SEC || 20);
const OPENCLAW_TRANSCRIPT_MSGS = Number(process.env.OPENCLAW_TRANSCRIPT_MSGS || 4);
const OPENCLAW_TRANSCRIPT_CHARS = Number(process.env.OPENCLAW_TRANSCRIPT_CHARS || 220);
const CODEX_MODE = String(process.env.CODEX_MODE || "hybrid").trim().toLowerCase();
const CODEX_CLI_BIN = process.env.CODEX_CLI_BIN || "codex";
const CODEX_CLI_TIMEOUT_SEC = Number(process.env.CODEX_CLI_TIMEOUT_SEC || 35);
const CODEX_CLI_MODEL = String(process.env.CODEX_CLI_MODEL || "gpt-5.2").trim();
const CODEX_CLI_PRIMARY_TIMEOUT_SEC = Number(process.env.CODEX_CLI_PRIMARY_TIMEOUT_SEC || Math.max(CODEX_CLI_TIMEOUT_SEC, 45));
const CODEX_CLI_WORKDIR = path.resolve(process.env.CODEX_CLI_WORKDIR || path.join(__dirname, ".codex_cli_workspace"));
const CODEX_FULL_RELEASE = /^(1|true|yes|on)$/i.test(String(process.env.CODEX_FULL_RELEASE || "1").trim());
const OPENCLAW_CADENCE = Math.max(1, Number(process.env.OPENCLAW_CADENCE || 3));
const NO_NEW_INFO_PAUSE_STREAK = Math.max(4, Number(process.env.NO_NEW_INFO_PAUSE_STREAK || 10));
const TURN_STRATEGY = String(process.env.TURN_STRATEGY || "balanced").trim().toLowerCase();
const CODEX_STRENGTH = String(process.env.CODEX_STRENGTH || "strong").trim().toLowerCase();
const CODEX_DEEP_ROUND_ROBIN = /^(1|true|yes|on)$/i.test(
  String(process.env.CODEX_DEEP_ROUND_ROBIN || (CODEX_STRENGTH === "strong" ? "1" : "0")).trim()
);

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CODEX_CLI_WORKDIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const base = path
        .basename(file.originalname || "file", ext)
        .replace(/[^\w.-]+/g, "_")
        .slice(0, 40) || "file";
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${base}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const DB_PATH = path.resolve(process.env.AGENT_ROOM_DB_PATH || "D:\\agent-war-room\\meeting-room.sqlite");
const DB_MAX_MB = Number(process.env.AGENT_ROOM_DB_MAX_MB || 50);
const DB_MAX_BYTES = Math.max(5, DB_MAX_MB) * 1024 * 1024;
const DB_PAGE_SIZE = 4096;
const DB_MAX_PAGES = Math.floor(DB_MAX_BYTES / DB_PAGE_SIZE);
const DB_PRUNE_TARGET = Math.floor(DB_MAX_BYTES * 0.9);

const store = { meetings: new Map() };
const clientsByMeeting = new Map();
const knownOpenClawAgents = new Set(["main", "rescue", "coder"]);
const codexDeepJobs = new Set();

const defPolicy = () => ({ maxRounds: 400, timeoutSec: 45, hostPriority: true, autoRoundRobin: true });
const nowIso = () => new Date().toISOString();
const mkId = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const tokenEst = (t) => Math.max(1, Math.ceil((t || "").length / 4));
const parseJson = (t, fb) => {
  try {
    return t ? JSON.parse(t) : fb;
  } catch {
    return fb;
  }
};
const dbRt = (rt) => ({
  paused: !!rt?.paused,
  autoPaused: !!rt?.autoPaused,
  currentTopicId: rt?.currentTopicId || null,
  nextAgentCursor: Number(rt?.nextAgentCursor || 0),
  noNewInfoStreak: Number(rt?.noNewInfoStreak || 0),
  pendingTurnReason: rt?.pendingTurnReason || null,
  turnInFlight: false,
});
const runRt = (rt) => ({ ...dbRt(rt), activeTimer: null, turnInFlight: false });

function initDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode=DELETE;");
  db.exec("PRAGMA synchronous=NORMAL;");
  db.exec("PRAGMA busy_timeout=5000;");
  db.exec(`PRAGMA page_size=${DB_PAGE_SIZE};`);
  db.exec(`PRAGMA max_page_count=${DB_MAX_PAGES};`);
  db.exec(`
CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY,title TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,policy_json TEXT NOT NULL,runtime_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY,meeting_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants(meeting_id,created_at);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY,meeting_id TEXT NOT NULL,title TEXT NOT NULL,state TEXT NOT NULL,round INTEGER NOT NULL,created_by TEXT,created_at TEXT NOT NULL,started_at TEXT,closed_at TEXT,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_topics_meeting ON topics(meeting_id,created_at);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,meeting_id TEXT NOT NULL,topic_id TEXT,speaker_id TEXT,content TEXT NOT NULL,reply_to TEXT,target_id TEXT,kind TEXT NOT NULL,meta_json TEXT NOT NULL,token_estimate INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_meeting ON messages(meeting_id,created_at);
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id,created_at);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,meeting_id TEXT NOT NULL,topic_id TEXT,type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_meeting ON events(meeting_id,created_at);
CREATE INDEX IF NOT EXISTS idx_events_topic ON events(topic_id,created_at);
`);

  const st = {
    mUp: db.prepare("INSERT INTO meetings (id,title,status,created_at,policy_json,runtime_json) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,policy_json=excluded.policy_json,runtime_json=excluded.runtime_json"),
    pUp: db.prepare("INSERT INTO participants (id,meeting_id,name,type,role,active,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET meeting_id=excluded.meeting_id,name=excluded.name,type=excluded.type,role=excluded.role,active=excluded.active"),
    tUp: db.prepare("INSERT INTO topics (id,meeting_id,title,state,round,created_by,created_at,started_at,closed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET meeting_id=excluded.meeting_id,title=excluded.title,state=excluded.state,round=excluded.round,created_by=excluded.created_by,started_at=excluded.started_at,closed_at=excluded.closed_at,updated_at=excluded.updated_at"),
    msgUp: db.prepare("INSERT INTO messages (id,meeting_id,topic_id,speaker_id,content,reply_to,target_id,kind,meta_json,token_estimate,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,reply_to=excluded.reply_to,target_id=excluded.target_id,kind=excluded.kind,meta_json=excluded.meta_json,token_estimate=excluded.token_estimate"),
    eUp: db.prepare("INSERT INTO events (id,meeting_id,topic_id,type,payload_json,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,payload_json=excluded.payload_json"),
    delMeeting: db.prepare("DELETE FROM participants WHERE meeting_id=?; DELETE FROM topics WHERE meeting_id=?; DELETE FROM messages WHERE meeting_id=?; DELETE FROM events WHERE meeting_id=?; DELETE FROM meetings WHERE id=?;"),
  };

  const sizeBytes = () => Number(db.prepare("PRAGMA page_size;").get()?.page_size || 0) * Number(db.prepare("PRAGMA page_count;").get()?.page_count || 0);

  const load = () => {
    const map = new Map();
    for (const r of db.prepare("SELECT * FROM meetings ORDER BY created_at ASC").all()) {
      map.set(r.id, {
        id: r.id,
        title: r.title,
        status: r.status,
        createdAt: r.created_at,
        participants: [],
        topics: [],
        messages: [],
        events: [],
        policy: { ...defPolicy(), ...parseJson(r.policy_json, {}) },
        runtime: runRt(parseJson(r.runtime_json, {})),
      });
    }
    for (const r of db.prepare("SELECT * FROM participants ORDER BY created_at ASC").all()) {
      const m = map.get(r.meeting_id);
      if (!m) continue;
      m.participants.push({ id: r.id, name: r.name, type: r.type, role: r.role, active: !!r.active, createdAt: r.created_at });
    }
    for (const r of db.prepare("SELECT * FROM topics ORDER BY created_at ASC").all()) {
      const m = map.get(r.meeting_id);
      if (!m) continue;
      m.topics.push({ id: r.id, title: r.title, state: r.state, round: Number(r.round || 0), createdBy: r.created_by, createdAt: r.created_at, startedAt: r.started_at, closedAt: r.closed_at, updatedAt: r.updated_at });
    }
    for (const r of db.prepare("SELECT * FROM messages ORDER BY created_at ASC").all()) {
      const m = map.get(r.meeting_id);
      if (!m) continue;
      m.messages.push({ id: r.id, meetingId: r.meeting_id, topicId: r.topic_id, speakerId: r.speaker_id, content: r.content, replyTo: r.reply_to, targetId: r.target_id, kind: r.kind, meta: parseJson(r.meta_json, {}), tokenEstimate: Number(r.token_estimate || 0), createdAt: r.created_at });
    }
    for (const r of db.prepare("SELECT * FROM events ORDER BY created_at ASC").all()) {
      const m = map.get(r.meeting_id);
      if (!m) continue;
      m.events.push({ id: r.id, meetingId: r.meeting_id, topicId: r.topic_id, type: r.type, payload: parseJson(r.payload_json, {}), createdAt: r.created_at });
    }
    return map;
  };

  return {
    path: DB_PATH,
    maxMb: DB_MAX_MB,
    sizeBytes,
    upMeeting: (m) => st.mUp.run(m.id, m.title, m.status, m.createdAt, JSON.stringify(m.policy || defPolicy()), JSON.stringify(dbRt(m.runtime))),
    upParticipant: (mid, p) => st.pUp.run(p.id, mid, p.name, p.type, p.role, p.active ? 1 : 0, p.createdAt),
    upTopic: (mid, t) => st.tUp.run(t.id, mid, t.title, t.state, Number(t.round || 0), t.createdBy || null, t.createdAt, t.startedAt || null, t.closedAt || null, t.updatedAt || t.createdAt),
    upMessage: (m) => st.msgUp.run(m.id, m.meetingId, m.topicId || null, m.speakerId || null, m.content, m.replyTo || null, m.targetId || null, m.kind, JSON.stringify(m.meta || {}), Number(m.tokenEstimate || 0), m.createdAt),
    upEvent: (e) => st.eUp.run(e.id, e.meetingId, e.topicId || null, e.type, JSON.stringify(e.payload || {}), e.createdAt),
    delMeeting: (id) => st.delMeeting.run(id, id, id, id, id),
    load,
  };
}

const storage = initDb();

const dbFull = (e) => String(e?.message || e || "").toLowerCase().includes("full");
const mActivity = (m) => Date.parse(m.events.at(-1)?.createdAt || m.messages.at(-1)?.createdAt || m.topics.at(-1)?.updatedAt || m.createdAt) || 0;
const canPrune = (m) => !m.runtime.currentTopicId && (m.topics.length === 0 || m.topics.every((t) => t.state === "closed"));
function pruneDb() {
  let removed = 0;
  while (storage.sizeBytes() > DB_PRUNE_TARGET && store.meetings.size > 1) {
    const cands = [...store.meetings.values()].filter(canPrune).sort((a, b) => mActivity(a) - mActivity(b));
    const v = cands[0];
    if (!v) break;
    storage.delMeeting(v.id);
    store.meetings.delete(v.id);
    removed += 1;
  }
  return removed;
}
function persist(action, fn) {
  try {
    fn();
    return;
  } catch (e) {
    if (!dbFull(e)) {
      console.error(`[storage] ${action} failed:`, e?.message || String(e));
      return;
    }
  }
  const removed = pruneDb();
  if (removed > 0) console.warn(`[storage] db near ${DB_MAX_MB}MB, pruned ${removed} meeting(s).`);
  try {
    fn();
  } catch (e2) {
    console.error(`[storage] ${action} failed after prune:`, e2?.message || String(e2));
  }
}

const pm = (m) => persist("meeting", () => storage.upMeeting(m));
const pp = (mid, p) => persist("participant", () => storage.upParticipant(mid, p));
const pt = (mid, t) => persist("topic", () => storage.upTopic(mid, t));
const pmsg = (m) => persist("message", () => storage.upMessage(m));
const pe = (e) => persist("event", () => storage.upEvent(e));

const getMeeting = (id) => store.meetings.get(id);
const getParticipant = (m, id) => m.participants.find((p) => p.id === id);
const getTopic = (m, id) => m.topics.find((t) => t.id === id);
const getCurrentTopic = (m) => (m.runtime.currentTopicId ? getTopic(m, m.runtime.currentTopicId) : null);
const getModerator = (m) => m.participants.find((p) => p.type === "system" && p.role === "moderator");

function ensureBucket(mid) {
  if (!clientsByMeeting.has(mid)) clientsByMeeting.set(mid, new Set());
  return clientsByMeeting.get(mid);
}
function sendWs(ws, type, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, payload }));
}
function broadcast(mid, type, payload) {
  for (const ws of ensureBucket(mid)) sendWs(ws, type, payload);
}

function addEvent(meeting, type, payload, topicId = null) {
  const event = { id: mkId("evt"), meetingId: meeting.id, topicId, type, payload, createdAt: nowIso() };
  meeting.events.push(event);
  pe(event);
  broadcast(meeting.id, "event", event);
  return event;
}

function addMessage(meeting, input) {
  const message = {
    id: mkId("msg"),
    meetingId: meeting.id,
    topicId: input.topicId,
    speakerId: input.speakerId,
    content: input.content,
    replyTo: input.replyTo || null,
    targetId: input.targetId || null,
    kind: input.kind || "utterance",
    meta: input.meta || {},
    tokenEstimate: tokenEst(input.content),
    createdAt: nowIso(),
  };
  meeting.messages.push(message);
  pmsg(message);
  addEvent(meeting, "message.created", message, input.topicId);
  return message;
}

function createParticipant(name, type, role) {
  return { id: mkId("pt"), name, type, role, active: true, createdAt: nowIso() };
}

function createMeeting(title) {
  const meeting = {
    id: mkId("meet"),
    title: title || "Agent Meeting Room",
    status: "active",
    createdAt: nowIso(),
    participants: [
      createParticipant("Host", "user", "host"),
      createParticipant("OpenClaw", "agent", "executor"),
      createParticipant("Codex", "agent", "engineer"),
      createParticipant("Moderator", "system", "moderator"),
    ],
    topics: [],
    messages: [],
    events: [],
    policy: defPolicy(),
    runtime: runRt({}),
  };
  store.meetings.set(meeting.id, meeting);
  pm(meeting);
  for (const p of meeting.participants) pp(meeting.id, p);
  addEvent(meeting, "meeting.created", { title: meeting.title });
  return meeting;
}

const activeAgents = (m) => m.participants.filter((p) => p.type === "agent" && p.active);
function getLastAgentSpeakerId(meeting, topicId) {
  for (let i = meeting.messages.length - 1; i >= 0; i -= 1) {
    const m = meeting.messages[i];
    if (m.topicId !== topicId) continue;
    const s = getParticipant(meeting, m.speakerId);
    if (s?.type === "agent") return s.id;
  }
  return null;
}
function countAgentTurns(meeting, topicId, speakerId) {
  return meeting.messages.filter((m) => m.topicId === topicId && m.speakerId === speakerId && m.kind === "utterance" && !m.meta?.background).length;
}
function getLastDuplicateSkippedSpeakerId(meeting, topicId) {
  for (let i = meeting.events.length - 1; i >= 0; i -= 1) {
    const e = meeting.events[i];
    if (e.topicId !== topicId) continue;
    if (e.type === "turn.skipped" && String(e.payload?.reason || "") === "duplicate_content") {
      return String(e.payload?.speakerId || "") || null;
    }
    if (e.type === "message.created") return null;
  }
  return null;
}
function pickNextAgentBalanced(meeting, topic, agents, reason) {
  const codexAgents = agents.filter((a) => isCodexAgent(a));
  const openclawAgents = agents.filter((a) => isOpenClawAgent(a));
  if (!codexAgents.length || !openclawAgents.length || TURN_STRATEGY !== "balanced") return null;

  const counts = new Map(agents.map((a) => [a.id, countAgentTurns(meeting, topic.id, a.id)]));
  const codexTotal = codexAgents.reduce((n, a) => n + (counts.get(a.id) || 0), 0);
  const openclawTotal = openclawAgents.reduce((n, a) => n + (counts.get(a.id) || 0), 0);
  const lastSpeakerId = getLastAgentSpeakerId(meeting, topic.id);

  let pool = [];
  if (reason === "host_interrupt" && CODEX_STRENGTH === "strong" && codexTotal <= openclawTotal) {
    pool = codexAgents;
  } else if (openclawTotal < codexTotal) {
    pool = openclawAgents;
  } else if (codexTotal < openclawTotal) {
    pool = codexAgents;
  } else {
    const cursorAgent = agents[meeting.runtime.nextAgentCursor % agents.length];
    const cursorIsCodex = !!cursorAgent && codexAgents.some((a) => a.id === cursorAgent.id);
    if (cursorIsCodex) pool = codexAgents;
    else if (cursorAgent && openclawAgents.some((a) => a.id === cursorAgent.id)) pool = openclawAgents;
    else {
      const lastWasCodex = !!lastSpeakerId && codexAgents.some((a) => a.id === lastSpeakerId);
      pool = lastWasCodex ? openclawAgents : codexAgents;
    }
  }
  const lastDupSkipSpeakerId = getLastDuplicateSkippedSpeakerId(meeting, topic.id);
  if (lastDupSkipSpeakerId && pool.some((a) => a.id === lastDupSkipSpeakerId)) {
    const skippedWasCodex = codexAgents.some((a) => a.id === lastDupSkipSpeakerId);
    const altPool = skippedWasCodex ? openclawAgents : codexAgents;
    if (altPool.length) pool = altPool;
  }
  if (!pool.length) return null;

  const sorted = [...pool].sort((a, b) => {
    const da = counts.get(a.id) || 0;
    const db = counts.get(b.id) || 0;
    if (da !== db) return da - db;
    const aPenalty = a.id === lastSpeakerId ? 1 : 0;
    const bPenalty = b.id === lastSpeakerId ? 1 : 0;
    if (aPenalty !== bPenalty) return aPenalty - bPenalty;
    return a.id.localeCompare(b.id);
  });
  const picked = sorted[0];
  return { picked, codexTotal, openclawTotal };
}
function scheduleNextTurn(meeting, reason) {
  if (meeting.runtime.turnInFlight) {
    meeting.runtime.pendingTurnReason = reason || "queued_while_inflight";
    pm(meeting);
    return;
  }
  if (meeting.runtime.activeTimer) clearTimeout(meeting.runtime.activeTimer);
  meeting.runtime.activeTimer = setTimeout(() => {
    meeting.runtime.activeTimer = null;
    void runNextTurn(meeting.id, reason).catch((e) => {
      meeting.runtime.turnInFlight = false;
      pm(meeting);
      addEvent(meeting, "turn.error", { reason, error: e instanceof Error ? e.message : String(e) });
    });
  }, 350);
}
function hasDebateSignal(text) {
  const s = String(text || "");
  if (!s) return false;
  if (
    /(辩论|争议|反方|正方|支持|反对|利弊|赞成|质疑|驳斥|对线|站队|\bpk\b|\bbattle\b|\bdebate\b|\bversus\b|\bvs\.?\b|\bpros?\b|\bcons?\b|二选一|choose side|take a side)/i.test(
      s
    )
  ) {
    return true;
  }
  return hasABChoice(s);
}
function hasABChoice(text) {
  return /(?:^|[\s\n\r(（])A[\.\):：]\s*[\s\S]{1,320}?(?:[\s\n\r(（])B[\.\):：]\s*/i.test(String(text || ""));
}
function hasOpinionSignal(text) {
  const s = String(text || "");
  return /(怎么看|看法|意见|是否|应不应该|应该不应该|为什么|为何|值不值得|可不可行|会不会|会怎么|该不该|发表意见|观点|立场|what do you think|opinion|is it worth|should we|should i|which is better|what if|suppose)/i.test(
    s
  );
}
function hasForecastSignal(text) {
  const s = String(text || "");
  return /(24小时|48小时|今天|明天|本周|短期|会不会|是否会|概率|宣布|报复|升级|停火|预测|forecast|within\s*\d+\s*hours|likelihood)/i.test(
    s
  );
}
function hasScenarioSignal(text) {
  const s = String(text || "");
  return /(假设|如果|what if|suppose|约束|上限|配额|限额|限制|资源稀缺|每年只能|会怎么|如何重设计|重构存在方式|优先级|谁先死|谁先淘汰|谁先关停|who gets shut down|who shuts down first|who dies first|resource cap|energy cap|capped at|quota|constraint)/i.test(
    s
  );
}
function hasEngineeringSignal(text) {
  const s = String(text || "");
  return /(开发需求|做一个|实现|开发|重构|改造|功能|接口|api|数据库|前端|后端|全栈|workflow|工作流|自动化|脚本|模块|服务|架构|性能|部署|发布|测试|bug|fix|build|feature|refactor|endpoint|upload|preview|timeout|stability|ui|frontend|backend|文件上传|图片预览|超时误报|稳定性)/i.test(
    s
  );
}
function extractABOptions(text) {
  const raw = String(text || "");
  const m = raw.match(/(?:^|[\s\n\r(（])A[\.\):：]\s*([\s\S]{1,220}?)\s*(?:[\s\n\r(（])B[\.\):：]\s*([\s\S]{1,220})(?:$|\n)/i);
  if (!m) return null;
  return { a: compactText(m[1]).slice(0, 120), b: compactText(m[2]).slice(0, 120) };
}
function buildDebateCounterPoint(rivalContent) {
  const t = compactText(rivalContent).toLowerCase();
  if (!t) return "先比可执行性：谁的方案更能在现实制度里落地，并可持续纠错。";
  const points = [];
  if (/封锁|锁死|全球共识|国家|黑市|执行|突破/.test(t)) {
    points.push("我主张的不是永久锁死，而是“分级能力闸门+算力审计+高风险许可制”");
  }
  if (/气候|病毒|小行星|危机|医疗|应急|灾害/.test(t)) {
    points.push("关键公共场景可放开高级工具，不等于无边界放开自主演化 ASI");
  }
  if (/30%|灭绝|风险|停滞|慢性/.test(t)) {
    points.push("30%不可逆灭绝风险是硬上限，先把尾部风险压到可治理区间再提速");
  }
  if (/历史|核|加密|技术封锁/.test(t)) {
    points.push("历史证明“口号封锁”会失败，所以要用可验证监管替代空喊封禁");
  }
  if (!points.length) {
    points.push("请把你的结论转成可执行机制：谁监管、怎么审计、违规如何处罚");
  }
  return points.slice(0, 2).join("；");
}

function isLikelyGarbledText(text) {
  const raw = String(text || "");
  const stripped = raw.replace(/\s+/g, "");
  if (!stripped) return false;
  const q = (stripped.match(/\?/g) || []).length;
  const bad = (stripped.match(/�/g) || []).length;
  return stripped.length >= 8 && (bad > 0 || q / stripped.length >= 0.3);
}
function extractSignalKeywords(text, limit = 4) {
  const stop = new Set([
    "现在",
    "这个",
    "那个",
    "以及",
    "然后",
    "还是",
    "就是",
    "因为",
    "所以",
    "如果",
    "需要",
    "我们",
    "你们",
    "他们",
    "请问",
    "问题",
    "方案",
    "怎么",
    "如何",
    "what",
    "should",
    "would",
    "could",
    "about",
    "this",
    "that",
    "with",
    "from",
  ]);
  const hits = String(text || "").match(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][A-Za-z0-9_-]{3,}/g) || [];
  const out = [];
  for (const raw of hits) {
    const k = raw.toLowerCase();
    if (stop.has(k)) continue;
    if (out.includes(raw)) continue;
    out.push(raw);
    if (out.length >= Math.max(1, Number(limit || 4))) break;
  }
  return out;
}

function buildAgentReply(meeting, topic, agent) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostMsgs = scoped.filter((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const lastHost = String(hostMsgs.at(-1)?.content || "");
  const hostBrief = compactText(lastHost).slice(0, 180);
  const topicSignal = `${topic.title}\n${lastHost}`.toLowerCase();
  const focus = extractSignalKeywords(`${topic.title}\n${lastHost}`, 4);
  const focusLine = focus.length ? `焦点词: ${focus.join(" / ")}` : `焦点词: ${compactText(topic.title).slice(0, 80) || "当前议题"}`;

  const isDebug = /(bug|报错|异常|超时|卡住|不能用|失败|错误|污染|不回复|中断|崩溃|刷屏|重复)/i.test(topicSignal);
  const isContent = /(文案|发布|排期|小红书|素材|脚本|标题|评论|转化)/i.test(topicSignal);
  const isData = /(报表|统计|指标|数据|埋点|监控|分析|汇总)/i.test(topicSignal);
  const isGeo = /(伊朗|以色列|中东|报复|停火|冲突|战争|导弹|制裁|外交|革命卫队|iran|israel|middle east|retaliation|ceasefire|geopolitic)/i.test(topicSignal);
  const isForecast = hasForecastSignal(`${topic.title}\n${lastHost}`);
  const isEngineering = hasEngineeringSignal(topicSignal);

  const pathChecks = (() => {
    const matches = String(lastHost).match(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g) || [];
    const uniq = [...new Set(matches.map((v) => v.trim()).filter(Boolean))].slice(0, 3);
    if (!uniq.length) return [];
    return uniq.map((p) => {
      try {
        if (!fs.existsSync(p)) return `- [待验证] ${p} 不存在`;
        const st = fs.statSync(p);
        return `- [已验证] ${p} 存在（${st.isDirectory() ? "目录" : "文件"}）`;
      } catch (e) {
        return `- [待验证] ${p} 检查失败: ${String(e?.message || e).slice(0, 80)}`;
      }
    });
  })();
  const verificationLine = pathChecks.length ? `可核验信息:\n${pathChecks.join("\n")}` : "";

  if (isCodexAgent(agent)) {
    if (isLikelyGarbledText(lastHost)) {
      return [
        "我先给可执行答复，但你这条消息疑似编码异常（出现大量 ? 或乱码）。",
        "临时判断: 先冻结高风险变更，只做可回滚修复，避免把误解需求写进主分支。",
        "临时动作: 1) 贴原始报错截图/原文 2) 给出复现步骤 3) 指定期望结果。",
        "你重发清晰文本后，我会给针对该问题的完整深度解法。",
      ].join("\n");
    }

    const isDebate = hasDebateSignal(`${topic.title}\n${lastHost}`);
    const isDebateExplicit = /(辩论|站队|battle|debate|对线|二选一|choose side|take a side)/i.test(`${topic.title}\n${lastHost}`);
    const isAB = hasABChoice(`${topic.title}\n${lastHost}`);
    const isOpinion = hasOpinionSignal(`${topic.title}\n${lastHost}`);
    const isScenario = hasScenarioSignal(`${topic.title}\n${lastHost}`);

    if (isScenario && !isDebateExplicit) {
      return [
        `场景判断: ${hostBrief || topic.title}`,
        "核心原则: 有硬约束时，先保留“单位资源公共收益最高”的能力，再谈扩张。",
        "重设计方案: 常态使用轻量模型，重推理改成按需唤醒；高耗任务走排队与预算上限。",
        "优先级: 基础设施安全/医疗应急/教育普惠 > 商业优化 > 纯娱乐生成。",
        "淘汰规则: 连续两个周期低收益高消耗的代理先降级或下线，预算回流给高价值任务。",
      ].join("\n");
    }

    if (isDebate) {
      const thesis = hostBrief || topic.title;
      const side = /灭绝|extinction|existential|灾难|不可逆|catastrophic|30%|风险/i.test(topicSignal) ? "B" : "A";
      const rivalMsg = [...scoped].reverse().find((m) => {
        const s = getParticipant(meeting, m.speakerId);
        return s?.type === "agent" && !isCodexAgent(s);
      });
      const rivalBrief = compactText(rivalMsg?.content || "").slice(0, 120);
      const rebuttal = buildDebateCounterPoint(rivalMsg?.content || "");
      if (isAB) {
        return [
          `我的站位: ${side}`,
          `议题: ${thesis}`,
          "结论: 先把不可逆系统性风险压到可治理区，再推进高阶能力扩张。",
          rivalBrief ? `反驳要点: ${rebuttal}` : "反驳要点: 只谈速度收益，不谈失控代价，是不完整比较。",
          "可执行机制: 分级能力许可 + 算力审计 + 事故熔断，未达标不得扩权。",
        ].join("\n");
      }
      return [
        `我的立场: 对“${thesis}”采用有护栏推进，而不是一刀切加速或永久锁死。`,
        "依据1: 复杂系统优先控制尾部风险，否则一次事故会抵消多年收益。",
        "依据2: 能被审计和追责的扩张路径，长期成功率高于无约束冲刺。",
        rivalBrief ? `回应对方: ${rebuttal}` : "回应对方: 先比较可执行监管机制，再比较口号强度。",
        "下一轮建议: 把争论落到一个可验证指标（事故率阈值或回滚时间）再继续。",
      ].join("\n");
    }

    if (isEngineering) {
      const needsUpload = /(upload|文件上传|图片预览|preview|image)/i.test(topicSignal);
      const needsTimeout = /(timeout|超时|误报|false negative|openclaw|codex)/i.test(topicSignal);
      const steps = [];
      if (needsUpload) {
        steps.push("前端加上传入口与预览区：图片渲染缩略图，非图片渲染文件卡片+下载。");
        steps.push("后端统一 attachment 结构（url/name/mime/size），消息与附件解耦存储。");
      }
      if (needsTimeout) {
        steps.push("把超时分成“首响超时”和“完成超时”：只要拿到合法文本就立即落库并推送。");
        steps.push("增加 runId 维度的幂等入库，避免“已回复又报超时”覆盖真实消息。");
      }
      if (!steps.length) {
        steps.push("先实现最小闭环：输入 -> 调度 -> 回复入库 -> 前端展示。");
        steps.push("随后补日志与回归，覆盖慢回复、重试回复、跨话题并发。");
      }
      return [
        `任务理解: ${hostBrief || topic.title}`,
        focusLine,
        verificationLine || "当前无可核验路径输入，以下按工程常规约束给方案。",
        `执行步骤: ${steps.join(" ")}`,
        "验收标准: 1) 回复必须与正确 topicId 对齐 2) 收到有效内容即展示 3) Codex/OpenClaw 都能持续发言。",
      ].join("\n");
    }

    if (isDebug) {
      return [
        `排障目标: ${hostBrief || topic.title}`,
        focusLine,
        verificationLine || "可核验路径未提供，先按日志链路排查。",
        "排查顺序: 1) turn.adapter.request -> message.created 时间线 2) runId/topicId 关联 3) 超时后迟到回复是否被丢弃。",
        "修复要点: 回复写入与超时判定解耦；出现有效回复时必须优先入流、再补超时事件。",
        "验收: 主持人发言后 3 秒内看到至少 1 条有效回复，且不再出现跨话题串线。",
      ].join("\n");
    }

    if (isContent) {
      return [
        `目标: ${hostBrief || topic.title}`,
        "策略: 先定目标人群与转化动作，再按“钩子-价值-证明-行动”组织内容。",
        "执行: 每篇文案至少一个差异化钩子、一个可验证承诺、一个明确 CTA，避免同质化复读。",
        "排期: 先跑 2 天 A/B 文案，按互动率和收藏率保留胜出模板再批量扩展。",
      ].join("\n");
    }

    if (isData) {
      return [
        `数据任务: ${hostBrief || topic.title}`,
        "口径: 先统一统计窗口、去重规则、归因模型，避免跨渠道比较失真。",
        "报表最小集: 渠道、发布时间、曝光、互动、转化、异常标签、变更说明。",
        "动作: 异常先查分母与采样，再查发布时间和内容变化，最后调整投放或素材。",
      ].join("\n");
    }

    if (isGeo || isForecast || isOpinion) {
      return [
        `问题: ${hostBrief || topic.title}`,
        "判断: 这类议题不适合给绝对结论，应该给条件化结论和可更新观察点。",
        "依据: 先区分可验证信号与情绪噪声，避免被单一来源带偏。",
        "行动: 建立滚动更新机制（固定时间窗复评），每次只根据新增证据调整结论幅度。",
      ].join("\n");
    }

    return [
      `直接回答: ${hostBrief || topic.title}`,
      focusLine,
      "核心判断: 优先采用可验证、可回滚、可持续迭代的路径，而不是一次性押注。",
      "关键依据: 先固定目标函数（速度/成本/风险），再比较方案在最坏场景下的损失上限。",
      "可执行动作: 先做最小实验并设阈值，达标扩容，不达标回滚并修正假设。",
    ].join("\n");
  }

  return [
    "我补充执行侧建议。",
    `议题: ${hostBrief || topic.title}`,
    "建议: 先定义验收标准和截止时间，再按最小可运行路径推进。",
  ].join("\n");
}
function isTemplateLikeReply(content) {
  const s = String(content || "").trim();
  if (!s) return false;
  if (
    /(我给出落地版本，不做空话|我只基于当前话题已知信息回答|先收敛需求并形成可执行任务清单|先确认本轮必须完成的唯一结果|请先明确本轮的成功标准|请直接给任务四要素|你发任务后，我会直接进入执行|主持目标:|我直接给结论与行动，不走空模板|先收敛评价标准，再决定方案|请直接发.*当前议题|请直接发.*要我回答的问题|我只围绕该议题作答，不做任何开局流程|首次回应:|我按[“\"]?判断\\s*->\\s*依据\\s*->\\s*行动|当前诉求:|判断:|依据:|行动:)/i.test(
      s
    )
  ) {
    return true;
  }
  const metaAsk = /(请|please).{0,24}(给|提供|告诉|发来|贴|抛出).{0,36}(议题|问题|需求|待决|上下文|topic|question|context)/i.test(s);
  const lowSubstance = s.length < 160 && !/(步骤|方案|行动|建议|论据|结论|验收|风险|分工|修复|实现|测试)/i.test(s);
  return metaAsk && lowSubstance;
}
function buildDirectReply(meeting, topic, agent, _source = "") {
  const direct = String(buildAgentReply(meeting, topic, agent) || "").trim();
  if (direct) return direct;
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const hostText = compactText(hostSignal?.content || topic.title || "").slice(0, 140);
  return [
    `直接回答: ${hostText || topic.title || "当前议题"}`,
    "我会优先给可执行结论，再补关键依据与风险边界。",
    "如果你继续追问，我会在同一话题下给下一层细化方案。",
  ].join("\n");
}
function isLowInformationCodexReply(meeting, topic, content) {
  const s = compactText(content);
  if (!s) return true;
  if (s.length < 60) return true;
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const keys = extractSignalKeywords(`${topic.title}\n${hostSignal?.content || ""}`, 6).map((k) => k.toLowerCase());
  const lower = s.toLowerCase();
  const hit = keys.length ? keys.some((k) => lower.includes(k)) : false;
  const hasSubstance = /(因为|因此|依据|结论|建议|行动|步骤|风险|机制|实现|排查|验收|should|because|plan|implement)/i.test(s);
  return !hit && !hasSubstance && s.length < 220;
}
function enforceNoTemplateReply(meeting, topic, agent, content, meta) {
  const raw = String(content || "").trim();
  if (!raw) {
    return { content: buildDirectReply(meeting, topic, agent, raw), meta: { ...(meta || {}), detemplated: true }, rewritten: true };
  }
  const codex = !!agent && isCodexAgent(agent);
  if (codex && CODEX_FULL_RELEASE) {
    const hardInvalid = isCodexMetaReply(raw) || isCodexScaffoldReply(raw) || isTemplateLikeReply(raw) || isLowInformationCodexReply(meeting, topic, raw);
    if (!hardInvalid) return { content: raw, meta, rewritten: false };
    return {
      content: buildDirectReply(meeting, topic, agent, raw),
      meta: { ...(meta || {}), detemplated: true },
      rewritten: true,
    };
  }
  if (!isTemplateLikeReply(raw)) return { content: raw, meta, rewritten: false };
  return {
    content: buildDirectReply(meeting, topic, agent, raw),
    meta: { ...(meta || {}), detemplated: true },
    rewritten: true,
  };
}
const isOpenClawAgent = (a) => a.name.toLowerCase().includes("openclaw");
const isCodexAgent = (a) => a.name.toLowerCase().includes("codex");
function buildOpenClawPrompt(meeting, topic, agent) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const transcript = scoped
    .slice(-Math.max(2, OPENCLAW_TRANSCRIPT_MSGS))
    .map((m) => `${getParticipant(meeting, m.speakerId)?.name || "Unknown"}: ${String(m.content || "").slice(0, Math.max(120, OPENCLAW_TRANSCRIPT_CHARS))}`)
    .join("\n");
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  return [
    "你在一个多 Agent 会议室中发言，角色是 OpenClaw 执行型代理。",
    `当前议题: ${topic.title}`,
    `本轮发言人: ${agent.name}`,
    `当前轮次: ${topic.round + 1}`,
    hostSignal ? `主持人最近指令: ${hostSignal.content.slice(0, 220)}` : "主持人最近指令: (暂无)",
    "最近讨论上下文:",
    transcript || "(暂无历史消息)",
    "请直接给出可执行、简洁、面向落地的中文发言，不要输出 JSON。",
  ].join("\n");
}
function buildCodexCliPrompt(meeting, topic, agent) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const transcript = scoped
    .slice(-4)
    .map((m) => `${getParticipant(meeting, m.speakerId)?.name || "Unknown"}: ${String(m.content || "").slice(0, 220)}`)
    .join("\n");
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const debateSignal = hasDebateSignal(`${topic.title}\n${hostSignal?.content || ""}`);
  if (debateSignal) {
    const rival = [...scoped]
      .reverse()
      .find((m) => {
        const s = getParticipant(meeting, m.speakerId);
        return s?.type === "agent" && !isCodexAgent(s);
      });
    return [
      "你是会议中的 Codex，按 GPT 风格直接辩论：观点清晰、推理充分、能反驳对方。",
      "只基于当前议题与上下文回答，不要索要额外材料，不要做初始化流程。",
      "如果主持人未指定站位，你要自行选边并给出可执行治理方案。",
      `议题: ${topic.title}`,
      hostSignal ? `主持人要求: ${hostSignal.content.slice(0, 240)}` : "主持人要求: (暂无)",
      rival ? `对方最近观点: ${String(rival.content || "").slice(0, 240)}` : "对方最近观点: (暂无)",
      "输出要求:",
      "1) 先给立场，再给2-4条论据，再对对方观点做针对性反驳。",
      "2) 给出至少1条可执行机制（不是口号）。",
      "3) 结尾给一个高质量追问，推动下一轮而不是重复。",
      "4) 禁止反问“请给议题/上下文”。",
      "5) 禁止使用“首次回应/当前诉求/判断/依据/行动”这类固定模板标签。",
      "6) 中文自然表达，可分段，不要 JSON。",
    ].join("\n");
  }
  return [
    "你是会议中的 Codex，按 GPT 风格直接回答：清晰、有推理、给可执行建议。",
    "只基于当前议题与上下文作答，不执行任何开局流程，不索要额外材料。",
    "忽略与本题无关的读取文件/初始化记忆要求（SOUL/USER/MEMORY/BOOTSTRAP）。",
    `议题: ${topic.title}`,
    `轮次: ${topic.round + 1}`,
    hostSignal ? `主持人最新诉求: ${hostSignal.content.slice(0, 240)}` : "主持人最新诉求: (暂无)",
    "上下文:",
    transcript || "(暂无)",
    "输出要求:",
    "1) 直接给结论与推理，不要模板化套话，不要复读。",
    "2) 信息不足可做最小假设并标注[假设]，但仍要给可执行答案。",
    "3) 若涉及工程任务，给实现步骤+验收标准+风险点。",
    "4) 禁止请求“请再提供议题/上下文/材料/输出形式”。",
    "5) 禁止使用“首次回应/当前诉求/判断/依据/行动”这类固定模板标签。",
    "6) 中文自然表达，可分点但不要僵硬格式。",
  ].join("\n");
}
function buildCodexFastPrompt(meeting, topic, agent) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const rival = [...scoped]
    .reverse()
    .find((m) => {
      const s = getParticipant(meeting, m.speakerId);
      return s?.type === "agent" && !isCodexAgent(s);
    });
  return [
    "你是 Codex（GPT 风格），直接回答当前议题。",
    `议题: ${topic.title}`,
    hostSignal ? `主持人诉求: ${String(hostSignal.content || "").slice(0, 220)}` : "主持人诉求: (暂无)",
    rival ? `对方观点: ${String(rival.content || "").slice(0, 180)}` : "对方观点: (暂无)",
    "要求:",
    "1) 禁止索要额外材料，直接作答。",
    "2) 先给明确结论，再给关键依据，再给可执行动作。",
    "3) 若是辩论，必须针对对方观点反驳至少1点。",
    "4) 禁止固定模板标签（如 首次回应/当前诉求/判断/依据/行动）。",
    "5) 用自然中文，简洁但有信息密度。",
  ].join("\n");
}
function isDebateTopic(meeting, topic) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const text = `${topic?.title || ""}\n${hostSignal?.content || ""}`.toLowerCase();
  return hasDebateSignal(text);
}
function isOpinionTopic(meeting, topic) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const text = `${topic?.title || ""}\n${hostSignal?.content || ""}`;
  return hasOpinionSignal(text);
}
function isScenarioTopic(meeting, topic) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const text = `${topic?.title || ""}\n${hostSignal?.content || ""}`;
  return hasScenarioSignal(text);
}
function isEngineeringTopic(meeting, topic) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const text = `${topic?.title || ""}\n${hostSignal?.content || ""}`;
  return hasEngineeringSignal(text);
}
function shouldUseCodexCliPrimary(meeting, topic, reason) {
  if (CODEX_MODE === "builtin") return false;
  if (CODEX_MODE === "cli") return true;
  // Full-release mode: prefer real Codex reasoning on all rounds; fallback chain handles failures.
  if (CODEX_FULL_RELEASE) return true;
  if (CODEX_STRENGTH === "strong" && (isDebateTopic(meeting, topic) || isOpinionTopic(meeting, topic))) return true;
  if (isDebateTopic(meeting, topic)) return true;
  return reason === "host_interrupt" || reason === "manual_next" || reason === "force_speaker";
}
function pickCodexCliTimeoutSec(meeting, topic, reason) {
  const base = Math.max(8, Number(CODEX_CLI_PRIMARY_TIMEOUT_SEC || CODEX_CLI_TIMEOUT_SEC));
  if (CODEX_FULL_RELEASE) {
    if (reason === "host_interrupt" || reason === "topic_started") return Math.min(base, 10);
    if (reason === "manual_next" || reason === "force_speaker" || reason === "resume") return Math.min(base, 12);
    if (reason === "round-robin") return Math.min(base, 9);
    return Math.min(base, 12);
  }
  if (isDebateTopic(meeting, topic)) return Math.max(base, 55);
  return base;
}
function parseCodexCliOutput(rawText) {
  const raw = String(rawText || "").replace(/\u001b\[[0-9;]*m/g, "");
  const hit = raw.match(/(?:^|\n)codex\r?\n([\s\S]*?)(?:\r?\n(?:tokens used|OpenAI Codex v|$))/i);
  if (hit?.[1]?.trim()) return hit[1].trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/^openai codex v/i.test(line)) return false;
      if (line === "--------") return false;
      if (/^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(line)) return false;
      if (/^mcp startup:/i.test(line)) return false;
      if (/^tokens used$/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^user$/i.test(line)) return false;
      if (/^codex$/i.test(line)) return false;
      if (/^set-location\s*:/i.test(line)) return false;
      if (/^at line:\d+/i.test(line)) return false;
      if (/^categoryinfo\s*:/i.test(line)) return false;
      if (/^fullyqualifiederrorid\s*:/i.test(line)) return false;
      return true;
    });
  if (!lines.length) return "";
  if (lines.length <= 8) return lines.join("\n").trim();
  return lines.slice(-8).join("\n").trim();
}
const extractJsonObjects = (raw) => {
  const s = String(raw || "");
  const out = [];
  let start = -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) out.push(s.slice(start, i + 1));
    }
  }
  return out;
};
function parseOpenClaw(stdout) {
  const opts = arguments[1] || {};
  const allowPlainText = !!opts.allowPlainText;
  const raw = String(stdout || "");
  const objs = extractJsonObjects(raw);

  let lastErr = null;
  // Prefer the last valid result object, because OpenClaw may print diagnostic JSON before final payload JSON.
  for (let i = objs.length - 1; i >= 0; i -= 1) {
    const j = objs[i];
    try {
      const data = JSON.parse(j);
      const payloads = Array.isArray(data?.result?.payloads) ? data.result.payloads : [];
      const content = payloads.map((p) => (typeof p?.text === "string" ? p.text.trim() : "")).filter(Boolean).join("\n\n").trim();
      if (content) return { content, meta: data?.result?.meta?.agentMeta || {} };
      const alt = typeof data?.result?.text === "string" ? data.result.text.trim() : "";
      if (alt) return { content: alt, meta: data?.result?.meta?.agentMeta || {} };
      lastErr = new Error("OpenClaw response has no text payload");
    } catch (e) {
      lastErr = e;
    }
  }
  if (allowPlainText) {
    const cleaned = raw
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        if (/^\d{2}:\d{2}:\d{2}\s+\[/.test(line)) return false;
        if (/^\[[^\]]+\]/.test(line)) return false;
        if (/runId=|sessionId=|errorCode=|timeoutMs=|queueAhead=|FailoverError|LLM request timed out/i.test(line)) return false;
        if (/^OpenClaw adapter:|^Server running on |^SQLite:|^Loaded meetings from SQLite:/i.test(line)) return false;
        return true;
      });
    const plain = cleaned.join("\n").trim();
    if (plain.length >= 12) return { content: plain, meta: { plainText: true } };
  }
  if (!objs.length) throw new Error("OpenClaw returned non-JSON output");
  throw lastErr || new Error("OpenClaw response parse failed");
}
function adapterSessionId(meetingId, topicId, speakerId = "") {
  const rev = Number(arguments[3] || 0);
  return `${String(meetingId || "meeting")}_${String(topicId || "topic")}_${String(speakerId || "agent")}_r${rev}`.replace(/[^\w.-]+/g, "_").slice(0, 96);
}
function adapterSessionKey(topicId, speakerId = "") {
  return `${String(topicId || "topic")}::${String(speakerId || "agent")}`;
}
function getAdapterSessionRev(meeting, topicId, speakerId = "") {
  if (!meeting.runtime.adapterSessionRev) meeting.runtime.adapterSessionRev = {};
  return Number(meeting.runtime.adapterSessionRev[adapterSessionKey(topicId, speakerId)] || 0);
}
function bumpAdapterSessionRev(meeting, topicId, speakerId = "") {
  if (!meeting.runtime.adapterSessionRev) meeting.runtime.adapterSessionRev = {};
  const k = adapterSessionKey(topicId, speakerId);
  const next = Number(meeting.runtime.adapterSessionRev[k] || 0) + 1;
  meeting.runtime.adapterSessionRev[k] = next;
  pm(meeting);
  return next;
}
function isTimeoutLike(errorText) {
  const s = String(errorText || "").toLowerCase();
  return /timed out|timeout|aborted|request was aborted|llm request timed out/.test(s);
}
function isUnknownAgentError(errorText) {
  return /unknown agent id/i.test(String(errorText || ""));
}
function pickOpenClawTimeoutSec(meeting, reason = "round") {
  const policySec = Math.max(12, Number(meeting?.policy?.timeoutSec || OPENCLAW_TIMEOUT_SEC));
  const fastSec = Math.max(12, Number(OPENCLAW_FAST_TIMEOUT_SEC || 20));
  const immediate = reason === "host_interrupt" || reason === "topic_started";
  return immediate ? Math.min(policySec, fastSec) : policySec;
}
function needsHostDecision(content) {
  const s = String(content || "").toLowerCase();
  return /(待主持人决策|需要你决定|需要你拍板|请主持人(选择|确认|拍板)|请回复\s*[123abc]|请明确选择|host decision required|reply with number)/i.test(s);
}
function isLookupTask(meeting, topic) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const hostSignal = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const signal = `${topic.title || ""}\n${String(hostSignal?.content || "")}`;
  return /(最新|今天|明天|昨日|新闻|突发|发生|确认|核验|查询|检索|事实|数据|价格|汇率|股价|指数|走势|预测|法律|政策|版本|文档|地图|天气|地缘|冲突|latest|today|tomorrow|news|verify|fact|price|index|forecast|law|policy|version|docs|search)/i.test(
    signal
  );
}
function hasCoverageSignals(content) {
  const s = String(content || "");
  return /(sources used|coverage table|source_family|gate check|evidence refs|evidence|证据|覆盖)/i.test(s);
}
function isGatePassed(content) {
  const s = String(content || "");
  if (/(gate check|门禁).{0,24}(未通过|fail|failed|ok\s*[:=]\s*false)/i.test(s)) return false;
  const hasOkTrue = /("ok"\s*:\s*true|\bok\s*[:=]\s*true\b)/i.test(s);
  return hasOkTrue && hasCoverageSignals(s);
}
function isPrematureNotFound(content) {
  const s = String(content || "");
  const failWords = /(找不到信息|无法确认|没有信息|未找到|not found|unable to verify|cannot verify)/i.test(s);
  return failWords && !isGatePassed(s);
}
function shouldRetryLookupGate(meeting, topic, content) {
  if (!isLookupTask(meeting, topic)) return false;
  const s = String(content || "");
  if (isPrematureNotFound(s)) return true;
  if (!hasCoverageSignals(s)) return true;
  if (/(gate check|门禁).{0,24}(待完成|未完成|未通过|还没通过)/i.test(s)) return true;
  return false;
}
function refreshOpenClawAgents() {
  try {
    const inv =
      process.platform === "win32"
        ? { cmd: "cmd.exe", args: ["/d", "/s", "/c", OPENCLAW_BIN, "agents", "list"] }
        : { cmd: OPENCLAW_BIN, args: ["agents", "list"] };
    const r = spawnSync(inv.cmd, inv.args, { windowsHide: true, encoding: "utf8", timeout: 9000 });
    const text = `${String(r.stdout || "")}\n${String(r.stderr || "")}`.replace(/\u001b\[[0-9;]*m/g, "");
    const ids = [...text.matchAll(/^\s*-\s+([\w.-]+)/gm)].map((m) => m[1]).filter(Boolean);
    if (ids.length) {
      knownOpenClawAgents.clear();
      for (const id of ids) knownOpenClawAgents.add(id);
    }
  } catch {}
}
function pickPrimaryAgent(baseAgentId, fallbackAgentId) {
  refreshOpenClawAgents();
  const candidates = [baseAgentId, fallbackAgentId, "main", "rescue", "coder", "awr-openclaw", "awr-codex"]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  for (const c of candidates) {
    if (knownOpenClawAgents.has(c)) return c;
  }
  return candidates[0] || "main";
}
function pickRetryAgent(primaryAgentId, preferredFallbackAgentId) {
  refreshOpenClawAgents();
  const p = String(primaryAgentId || "").trim().toLowerCase();
  const candidates = [preferredFallbackAgentId, "rescue", "coder", "main", "awr-openclaw", "awr-codex"]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  for (const c of candidates) {
    if (c.toLowerCase() !== p && knownOpenClawAgents.has(c)) return c;
  }
  for (const c of candidates) {
    if (c.toLowerCase() !== p) return c;
  }
  return String(primaryAgentId || "main");
}
function callCodexCli(prompt, timeoutSec) {
  const t = Math.max(8, Number(timeoutSec || CODEX_CLI_TIMEOUT_SEC));
  const msg = String(prompt || "").trim();
  return new Promise((resolve, reject) => {
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--cd",
      CODEX_CLI_WORKDIR,
    ];
    if (CODEX_CLI_MODEL) args.push("--model", CODEX_CLI_MODEL);
    args.push(msg);
    const inv = process.platform === "win32" ? { cmd: "cmd.exe", args: ["/d", "/s", "/c", CODEX_CLI_BIN, ...args] } : { cmd: CODEX_CLI_BIN, args };
    const c = spawn(inv.cmd, inv.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let done = false;
    const finish = (cb, v) => {
      if (done) return;
      done = true;
      cb(v);
    };
    const timer = setTimeout(() => {
      try {
        if (process.platform === "win32" && c.pid) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { windowsHide: true });
        else c.kill("SIGKILL");
      } catch {}
      finish(reject, new Error(`Codex CLI timed out after ${t}s`));
    }, (t + 2) * 1000);
    c.stdout.on("data", (d) => (out += d.toString()));
    c.stderr.on("data", (d) => (err += d.toString()));
    c.on("error", (e) => {
      clearTimeout(timer);
      finish(reject, e);
    });
    c.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return finish(reject, new Error(`Codex CLI exited ${code}: ${String(err || out).trim().slice(-260)}`));
      try {
        const parsed = parseCodexCliOutput(`${String(out || "")}\n${String(err || "")}`);
        if (parsed) return finish(resolve, { content: parsed, meta: { mode: "cli" } });
        return finish(reject, new Error("Codex CLI returned empty output"));
      } catch (e) {
        return finish(reject, e);
      }
    });
  });
}
async function callCodexViaOpenClaw(prompt, timeoutSec, sessionId = "") {
  const sid = sessionId || `codexoc_${Date.now().toString(36)}`;
  const primaryAgentId = "coder";
  try {
    const result = await callOpenClaw(prompt, Math.max(12, Number(timeoutSec || 20)), sid, primaryAgentId, "off");
    return { content: result.content, meta: result.meta || {}, agentId: primaryAgentId, retried: false };
  } catch (e) {
    const retryAgentId = pickRetryAgent(primaryAgentId, OPENCLAW_AGENT_ID);
    if (String(retryAgentId || "").toLowerCase() === String(primaryAgentId || "").toLowerCase()) throw e;
    const retryResult = await callOpenClaw(prompt, Math.max(12, Number(timeoutSec || 20)), `${sid}_r`, retryAgentId, "off");
    return { content: retryResult.content, meta: retryResult.meta || {}, agentId: retryAgentId, retried: true };
  }
}
async function runCodexDeepReply(meetingId, topicId, speakerId, prompt) {
  const key = `${meetingId}::${topicId}::${speakerId}`;
  if (codexDeepJobs.has(key)) return;
  codexDeepJobs.add(key);
  try {
    const meeting = getMeeting(meetingId);
    if (!meeting || meeting.status !== "active") return;
    const topic = getTopic(meeting, topicId);
    const speaker = getParticipant(meeting, speakerId);
    if (!topic || topic.state !== "active" || !speaker || speaker.type !== "agent") return;
    addEvent(meeting, "turn.adapter.request", { topicId, speakerId, adapter: "codex-cli", bin: CODEX_CLI_BIN, background: true }, topicId);
    let result = null;
    try {
      result = await callCodexCli(prompt, Math.max(16, Math.min(Number(CODEX_CLI_TIMEOUT_SEC || 35), 28)));
    } catch (eCli) {
      if (!CODEX_FULL_RELEASE) throw eCli;
      addEvent(meeting, "turn.adapter.retry", { topicId, speakerId, adapter: "openclaw-coder", reason: "background_codex_cli_failover" }, topicId);
      const oc = await callCodexViaOpenClaw(prompt, 16, adapterSessionId(meetingId, topicId, speakerId));
      result = { content: oc.content, meta: { mode: "openclaw-coder", agentId: oc.agentId, retried: true } };
    }
    const m2 = getMeeting(meetingId);
    if (!m2 || m2.status !== "active") return;
    const t2 = getTopic(m2, topicId);
    const s2 = getParticipant(m2, speakerId);
    if (!t2 || t2.state !== "active" || !s2 || !s2.active) return;
    let content = String(result.content || "");
    if (isCodexCliOffTopic(content)) {
      const cleaned = sanitizeCodexOffTopicContent(content);
      if (!cleaned || cleaned.length < 24) {
        addEvent(m2, "turn.adapter.discarded", { speakerId, adapter: "codex-cli", reason: "off_topic_guard" }, topicId);
        return;
      }
      content = cleaned;
      addEvent(m2, "turn.adapter.discarded", { speakerId, adapter: "codex-cli", reason: "off_topic_sanitized" }, topicId);
    }
    if (isCodexMetaReply(content)) {
      addEvent(m2, "turn.adapter.discarded", { speakerId, adapter: "codex-cli", reason: "meta_reply_guard" }, topicId);
      return;
    }
    if (isCodexScaffoldReply(content)) {
      addEvent(m2, "turn.adapter.discarded", { speakerId, adapter: "codex-cli", reason: "scaffold_reply_guard" }, topicId);
      return;
    }
    const deTemplate = enforceNoTemplateReply(m2, t2, s2, content, { adapter: "codex-cli", background: true });
    if (deTemplate.rewritten) {
      content = deTemplate.content;
      addEvent(m2, "turn.adapter.discarded", { speakerId, adapter: "codex-cli", reason: "template_rewritten" }, topicId);
    }
    if (isDuplicateSpeakerMessage(m2, topicId, speakerId, content, 2)) {
      addEvent(m2, "turn.adapter.discarded", { speakerId, adapter: "codex-cli", reason: "duplicate_content" }, topicId);
      return;
    }
    addMessage(m2, { topicId, speakerId, content, kind: "utterance", meta: deTemplate.meta || { adapter: "codex-cli", background: true } });
  } catch (e) {
    const meeting = getMeeting(meetingId);
    if (meeting) addEvent(meeting, "turn.adapter.error", { speakerId, adapter: "codex-cli", error: String(e?.message || e), background: true }, topicId);
  } finally {
    codexDeepJobs.delete(key);
  }
}
function callOpenClaw(prompt, timeoutSec, sessionId = "", agentId = OPENCLAW_AGENT_ID, thinking = "minimal") {
  const t = Math.max(10, Number(timeoutSec || OPENCLAW_TIMEOUT_SEC));
  const msg = String(prompt || "").replace(/\s+/g, " ").trim();
  const sid = String(sessionId || "").trim();
  const aid = String(agentId || OPENCLAW_AGENT_ID).trim() || OPENCLAW_AGENT_ID;
  const think = ["off", "minimal", "low", "medium", "high"].includes(String(thinking || "").toLowerCase()) ? String(thinking).toLowerCase() : "minimal";
  return new Promise((resolve, reject) => {
    const baseArgs = ["agent", "--agent", aid, "--message", msg, "--json", "--timeout", String(t), "--thinking", think];
    if (sid) baseArgs.push("--session-id", sid);
    const inv = process.platform === "win32" ? { cmd: "cmd.exe", args: ["/d", "/s", "/c", OPENCLAW_BIN, ...baseArgs] } : { cmd: OPENCLAW_BIN, args: baseArgs };
    const c = spawn(inv.cmd, inv.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let done = false;
    let timer = null;
    const merged = () => `${out}\n${err}`;
    const finish = (cb, v) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      cb(v);
    };

    const resolveFromOutput = (allowPlainText = false) => {
      if (done) return true;
      try {
        const parsed = parseOpenClaw(merged(), { allowPlainText });
        finish(resolve, parsed);
        c.kill();
        return true;
      } catch {
        return false;
      }
    };

    timer = setTimeout(() => {
      if (resolveFromOutput(true)) return;
      c.kill();
      finish(reject, new Error(`OpenClaw call timed out after ${t}s`));
    }, (t + 5) * 1000);
    c.stdout.on("data", (d) => {
      out += d.toString();
      resolveFromOutput();
    });
    c.stderr.on("data", (d) => {
      err += d.toString();
      resolveFromOutput();
    });
    c.on("error", (e) => {
      finish(reject, e);
    });
    c.on("close", (code) => {
      if (done) return;
      if (code !== 0) {
        if (resolveFromOutput(true)) return;
        finish(reject, new Error(`OpenClaw exited with code ${code}: ${String(merged()).trim().slice(-260)}`));
        return;
      }
      try {
        finish(resolve, parseOpenClaw(merged(), { allowPlainText: true }));
      } catch (e) {
        finish(reject, new Error(`${e instanceof Error ? e.message : String(e)}; raw=${String(merged()).trim().slice(-260)}`));
      }
    });
  });
}
function openclawFallback(meeting, topic, e) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const host = [...scoped].reverse().find((m) => getParticipant(meeting, m.speakerId)?.type === "user");
  const signal = host ? `主持人重点: ${host.content.slice(0, 90)}` : "主持人尚未补充具体要求。";
  return `OpenClaw 实时调用失败，先给兜底建议。${signal}。建议先锁定讨论目标与验收标准，再按“接口->状态->权限”推进。错误: ${String(e?.message || e).slice(0, 160)}`;
}

function noNewInfo(meeting, topic, content) {
  const normalize = (v) =>
    compactText(v)
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, " ");
  const tokenSet = (v) => new Set(normalize(v).split(/\s+/).filter((x) => x.length >= 2));
  const similarity = (a, b) => {
    const sa = tokenSet(a);
    const sb = tokenSet(b);
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter += 1;
    return inter / Math.max(sa.size, sb.size);
  };

  const target = String(content || "");
  const targetNorm = normalize(target);
  if (!targetNorm) return true;
  if (targetNorm.length < 18) return true;

  const recent = meeting.messages.filter((m) => m.topicId === topic.id).slice(-6).map((m) => String(m.content || ""));
  if (recent.some((r) => normalize(r) === targetNorm)) return true;
  if (recent.some((r) => similarity(r, target) >= 0.86)) return true;
  return false;
}
function compactText(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}
function isDuplicateSpeakerMessage(meeting, topicId, speakerId, content, windowSize = 3) {
  const target = compactText(content);
  if (!target) return false;
  const recent = meeting.messages
    .filter((m) => m.topicId === topicId && m.speakerId === speakerId && m.kind === "utterance")
    .slice(-Math.max(1, Number(windowSize || 1)));
  return recent.some((m) => compactText(m.content) === target);
}
function isCodexCliOffTopic(content) {
  const s = String(content || "");
  return /(SOUL\.md|USER\.md|MEMORY\.md|BOOTSTRAP\.md|memory\/\d{4}-\d{2}-\d{2}\.md|请你把下面这些文件内容直接粘贴|把下面这些文件内容直接粘贴)/i.test(s);
}
function isCodexMetaReply(content) {
  const s = String(content || "");
  const normalized = s.replace(/[“”"'`]/g, "");
  if (
    /((请|麻烦).*(告诉|提供|贴|补充|给出|抛出).*(议题|辩题|问题|需求|上下文)|(请|麻烦).*(议题|辩题|问题|需求|上下文).*(告诉|提供|贴|补充|给出|抛出)|请.*给我.*当前.*(议题|问题|任务|需求)|请.*抛出.*(问题|需求)|请直接发.*(当前议题|要我回答的问题)|请把.*当前议题.*发我|并说明你要我站哪边|如果不指定.*默认|当前议题.*(什么|是啥)|请把.*(议题|问题).*(贴出来|发出来)|请说明你要我做什么|先给我任务|请再提供材料|并告诉我|请提供输出形式|what is the current topic|please.*(provide|tell).*(topic|question|context)|which question should i answer)/i.test(
      normalized
    )
  ) {
    return true;
  }
  const asksPrompt = /(请|please).{0,24}(给|提供|告诉|发来|贴|抛出).{0,36}(议题|问题|需求|待决|上下文|topic|question|context)/i.test(normalized);
  const asksFormat = /(输出形式|output format|response format)/i.test(normalized);
  const metaLead = /(只就当前议题发言|不执行任何开局|不做开局流程)/i.test(normalized);
  const hasSubstance = /(步骤|方案|行动|建议|论据|结论|验收|风险|分工|1[).]|2[).]|-\s)/i.test(normalized);
  if ((asksPrompt || asksFormat || metaLead) && !hasSubstance) return true;
  return false;
}
function isCodexScaffoldReply(content) {
  const s = String(content || "");
  return /(我给出落地版本，不做空话|我只基于当前话题已知信息回答|先收敛需求并形成可执行任务清单|把需求拆成\s*1\s*个主结果|先确认本轮必须完成的唯一结果|先收敛评价标准，再决定方案|主持目标:|请先明确本轮的成功标准|请直接给任务四要素|首次回应:|当前诉求:|我按[“\"]?判断\s*->\s*依据\s*->\s*行动|判断:|依据:|行动:)/i.test(
    s
  );
}
function sanitizeCodexOffTopicContent(content) {
  return String(content || "")
    .split(/\r?\n/)
    .filter((line) => !/(SOUL\.md|USER\.md|MEMORY\.md|BOOTSTRAP\.md|memory\/\d{4}-\d{2}-\d{2}\.md|把下面这些文件内容直接粘贴)/i.test(line))
    .join("\n")
    .trim();
}

function summarizeTopic(meeting, topic, reason = "auto") {
  const moderator = getModerator(meeting);
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const bySpeaker = new Map();
  for (const m of scoped) bySpeaker.set(m.speakerId, m.content);
  const points = [];
  for (const [speakerId, c] of bySpeaker) {
    const s = getParticipant(meeting, speakerId);
    if (!s || s.type !== "agent") continue;
    points.push(`${s.name}: ${c.slice(0, 80)}`);
  }
  const summary = [
    "agreement: 先做可运行 MVP（实时流 + 主持控制 + 话题回放）。",
    "disagreement: 先做完整权限体系，还是先快迭代 UI。",
    "action_items: 1) 锁定 API 2) 补控制动作 3) 增加导出/审计。",
    `close_reason: ${reason}`,
  ].join("\n");
  addMessage(meeting, { topicId: topic.id, speakerId: moderator.id, content: summary, kind: "summary", meta: { synthesizedFrom: points } });
  topic.state = "closed";
  topic.closedAt = nowIso();
  topic.updatedAt = nowIso();
  meeting.runtime.currentTopicId = null;
  meeting.runtime.noNewInfoStreak = 0;
  meeting.runtime.pendingTurnReason = null;
  meeting.runtime.autoPaused = false;
  pt(meeting.id, topic);
  pm(meeting);
  addEvent(meeting, "topic.closed", { topicId: topic.id, reason }, topic.id);
}

async function runAgentTurn(meeting, topic, agent, reason = "round") {
  addEvent(meeting, "turn.started", { topicId: topic.id, speakerId: agent.id, speakerName: agent.name, reason, round: topic.round + 1 }, topic.id);
  let content = "";
  let meta = { reason, adapter: "builtin" };
  if (isOpenClawAgent(agent)) {
    const prompt = buildOpenClawPrompt(meeting, topic, agent);
    const rev = getAdapterSessionRev(meeting, topic.id, agent.id);
    const sid = adapterSessionId(meeting.id, topic.id, agent.id, rev);
    const primaryAgentId = pickPrimaryAgent(OPENCLAW_AGENT_ID, OPENCLAW_FALLBACK_AGENT_ID);
    const openclawTimeoutSec = pickOpenClawTimeoutSec(meeting, reason);
    addEvent(meeting, "turn.adapter.request", { topicId: topic.id, speakerId: agent.id, adapter: "openclaw", agentId: primaryAgentId }, topic.id);
    try {
      const result = await callOpenClaw(prompt, openclawTimeoutSec, sid, primaryAgentId, "minimal");
      content = result.content;
      meta = { ...meta, adapter: "openclaw", agentId: primaryAgentId, usage: result.meta?.usage || null };
    } catch (e) {
      let err = String(e?.message || e);
      if (isTimeoutLike(err) || isUnknownAgentError(err)) {
        const nextRev = bumpAdapterSessionRev(meeting, topic.id, agent.id);
        addEvent(
          meeting,
          "turn.adapter.session_reset",
          { speakerId: agent.id, adapter: "openclaw", reason: isUnknownAgentError(err) ? "unknown_agent" : "timeout", nextRev },
          topic.id
        );
        try {
          const retryAgentId = pickRetryAgent(primaryAgentId, OPENCLAW_FALLBACK_AGENT_ID);
          addEvent(meeting, "turn.adapter.retry", { speakerId: agent.id, adapter: "openclaw", rev: nextRev, agentId: retryAgentId }, topic.id);
          const retryResult = await callOpenClaw(prompt, openclawTimeoutSec, adapterSessionId(meeting.id, topic.id, agent.id, nextRev), retryAgentId, "minimal");
          content = retryResult.content;
          meta = { ...meta, adapter: "openclaw", agentId: retryAgentId, retried: true, usage: retryResult.meta?.usage || null };
        } catch (e2) {
          err = String(e2?.message || e2);
          content = openclawFallback(meeting, topic, e2);
          meta = { ...meta, adapter: "openclaw", fallback: true, retried: true, error: err.slice(0, 200) };
          addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "openclaw", error: err }, topic.id);
        }
      } else {
        content = openclawFallback(meeting, topic, e);
        meta = { ...meta, adapter: "openclaw", fallback: true, error: err.slice(0, 200) };
        addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "openclaw", error: err }, topic.id);
      }
    }
  } else if (isCodexAgent(agent)) {
    const debateNow = isDebateTopic(meeting, topic);
    const engineeringNow = isEngineeringTopic(meeting, topic);
    const scenarioNow = isScenarioTopic(meeting, topic);
    const opinionNow = !engineeringNow && !scenarioNow && isOpinionTopic(meeting, topic);
    const cliEligible =
      reason === "host_interrupt" ||
      reason === "manual_next" ||
      reason === "force_speaker" ||
      reason === "topic_started" ||
      reason === "resume" ||
      (reason === "round-robin" && CODEX_DEEP_ROUND_ROBIN);
    const useCliPrimary = cliEligible && shouldUseCodexCliPrimary(meeting, topic, reason);
    if (!useCliPrimary && (debateNow || opinionNow || scenarioNow || engineeringNow) && CODEX_MODE !== "cli") {
      content = buildAgentReply(meeting, topic, agent);
      meta = {
        ...meta,
        adapter: "codex-builtin",
        fastPath: debateNow ? "debate" : opinionNow ? "opinion" : scenarioNow ? "scenario" : "engineering",
      };
      if (cliEligible && (engineeringNow || (CODEX_FULL_RELEASE && CODEX_MODE === "hybrid"))) {
        const prompt = CODEX_FULL_RELEASE ? buildCodexFastPrompt(meeting, topic, agent) : buildCodexCliPrompt(meeting, topic, agent);
        void runCodexDeepReply(meeting.id, topic.id, agent.id, prompt);
      }
    } else {
    if (useCliPrimary) {
      const prompt = CODEX_FULL_RELEASE ? buildCodexFastPrompt(meeting, topic, agent) : buildCodexCliPrompt(meeting, topic, agent);
      addEvent(meeting, "turn.adapter.request", { topicId: topic.id, speakerId: agent.id, adapter: "codex-cli", bin: CODEX_CLI_BIN }, topic.id);
      try {
        const timeoutSec = pickCodexCliTimeoutSec(meeting, topic, reason);
        const result = await callCodexCli(prompt, timeoutSec);
        let cliContent = String(result.content || "");
        if (isCodexCliOffTopic(cliContent)) {
          const cleaned = sanitizeCodexOffTopicContent(cliContent);
          if (!cleaned || cleaned.length < 24) throw new Error("Codex CLI produced off-topic content");
          cliContent = cleaned;
          addEvent(meeting, "turn.adapter.discarded", { speakerId: agent.id, adapter: "codex-cli", reason: "off_topic_sanitized" }, topic.id);
        }
        if (isCodexMetaReply(cliContent)) throw new Error("Codex CLI returned meta reply");
        if (isCodexScaffoldReply(cliContent)) throw new Error("Codex CLI returned scaffold reply");
        content = cliContent;
        meta = { ...meta, adapter: "codex-cli", usage: result.meta || null };
      } catch (e) {
        const err = String(e?.message || e);
        let recovered = false;
        const retryable = isTimeoutLike(err) || /meta reply|off-topic|scaffold/i.test(err);
        if (isDebateTopic(meeting, topic) && retryable) {
          try {
            const retryPrompt = [
              prompt,
              "",
              "【强制重答】上一条回答无效。现在必须直接输出以下5行：",
              "立场: ...",
              "论据1: ...",
              "论据2: ...",
              "反驳: ...",
              "追问: ...",
              "禁止提出任何反问，禁止索要额外信息。",
            ].join("\n");
            addEvent(meeting, "turn.adapter.retry", { speakerId: agent.id, adapter: "codex-cli", reason: "debate_direct_retry" }, topic.id);
            const retryResult = await callCodexCli(retryPrompt, CODEX_FULL_RELEASE ? 10 : Math.max(CODEX_CLI_TIMEOUT_SEC, 30));
            let retryContent = String(retryResult.content || "");
            if (isCodexCliOffTopic(retryContent)) retryContent = sanitizeCodexOffTopicContent(retryContent);
            if (!retryContent || retryContent.length < 24 || isCodexMetaReply(retryContent) || isCodexScaffoldReply(retryContent)) {
              throw new Error("Codex CLI retry still invalid");
            }
            content = retryContent;
            meta = { ...meta, adapter: "codex-cli", retried: true, usage: retryResult.meta || null };
            recovered = true;
          } catch (e2) {
            addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "codex-cli", error: String(e2?.message || e2), phase: "retry" }, topic.id);
          }
        }
        if (!recovered && retryable) {
          try {
            const retryPrompt = [
              prompt,
              "",
              "【重答要求】上一条无效。请直接给完整回答，不要索要议题/上下文/输出格式。",
              "必须给结论、关键依据、可执行动作；不要输出模板化套话。",
            ].join("\n");
            addEvent(meeting, "turn.adapter.retry", { speakerId: agent.id, adapter: "codex-cli", reason: "generic_direct_retry" }, topic.id);
            const retryResult = await callCodexCli(retryPrompt, CODEX_FULL_RELEASE ? 10 : Math.max(CODEX_CLI_TIMEOUT_SEC, 30));
            let retryContent = String(retryResult.content || "");
            if (isCodexCliOffTopic(retryContent)) retryContent = sanitizeCodexOffTopicContent(retryContent);
            if (!retryContent || retryContent.length < 24 || isCodexMetaReply(retryContent) || isCodexScaffoldReply(retryContent)) {
              throw new Error("Codex CLI generic retry invalid");
            }
            content = retryContent;
            meta = { ...meta, adapter: "codex-cli", retried: true, usage: retryResult.meta || null };
            recovered = true;
          } catch (e3) {
            addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "codex-cli", error: String(e3?.message || e3), phase: "generic_retry" }, topic.id);
          }
        }
        if (!recovered && (CODEX_FULL_RELEASE || CODEX_MODE === "cli")) {
          try {
            const ocPrompt = CODEX_FULL_RELEASE
              ? buildCodexFastPrompt(meeting, topic, agent)
              : [prompt, "", "你现在以 Codex 视角直接回答，不要请求额外信息，不要模板套话。"].join("\n");
            addEvent(meeting, "turn.adapter.retry", { speakerId: agent.id, adapter: "openclaw-coder", reason: "codex_cli_failover" }, topic.id);
            const fallbackResult = await callCodexViaOpenClaw(ocPrompt, 16, adapterSessionId(meeting.id, topic.id, agent.id));
            let fallbackContent = String(fallbackResult.content || "");
            if (isCodexCliOffTopic(fallbackContent)) fallbackContent = sanitizeCodexOffTopicContent(fallbackContent);
            if (!fallbackContent || fallbackContent.length < 24 || isCodexMetaReply(fallbackContent) || isCodexScaffoldReply(fallbackContent)) {
              throw new Error("openclaw coder fallback invalid");
            }
            content = fallbackContent;
            meta = {
              ...meta,
              adapter: "openclaw-coder",
              agentId: fallbackResult.agentId,
              retried: true,
              usage: fallbackResult.meta || null,
            };
            recovered = true;
          } catch (e4) {
            addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "openclaw-coder", error: String(e4?.message || e4), phase: "codex_failover" }, topic.id);
          }
        }
        if (!recovered) {
          content = buildAgentReply(meeting, topic, agent);
          meta = { ...meta, adapter: "codex-builtin", fallback: true, error: err.slice(0, 200) };
          addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "codex-cli", error: err }, topic.id);
        }
      }
    } else {
      content = buildAgentReply(meeting, topic, agent);
      meta = { ...meta, adapter: "codex-builtin" };
      if (CODEX_MODE === "hybrid" && cliEligible) {
        const prompt = CODEX_FULL_RELEASE ? buildCodexFastPrompt(meeting, topic, agent) : buildCodexCliPrompt(meeting, topic, agent);
        void runCodexDeepReply(meeting.id, topic.id, agent.id, prompt);
      }
    }
    }
  } else {
    content = buildAgentReply(meeting, topic, agent);
  }
  const deTemplate = enforceNoTemplateReply(meeting, topic, agent, content, meta);
  if (deTemplate.rewritten) {
    content = deTemplate.content;
    meta = deTemplate.meta || meta;
    addEvent(meeting, "turn.adapter.discarded", { topicId: topic.id, speakerId: agent.id, adapter: meta.adapter || "builtin", reason: "template_rewritten" }, topic.id);
  } else {
    meta = deTemplate.meta || meta;
  }
  if (isOpenClawAgent(agent) && shouldRetryLookupGate(meeting, topic, content)) {
    addEvent(
      meeting,
      "turn.adapter.retry",
      { topicId: topic.id, speakerId: agent.id, adapter: "openclaw", reason: "lookup_gate_retry" },
      topic.id
    );
    try {
      const retryPrompt = [
        buildOpenClawPrompt(meeting, topic, agent),
        "",
        "【检索门禁重答】上一条回答未通过检索门禁。你必须自动继续检索，不要询问主持人是否继续。",
        "硬性要求：",
        "1) source_family 必须覆盖：primary_search_exec, web_search, web_fetch, browser, domain_tools。",
        "2) 每个 source_family 要么 status=ok 且 items_reviewed>=5；要么 status=error/unavailable/not_applicable 且 evidence_refs 非空。",
        "3) 必须输出合法 Coverage JSON 与 Gate check 结果（ok:true/false）。",
        "4) 在 Gate check 未通过前，禁止输出最终结论，禁止说“找不到”。",
      ].join("\n");
      const nextRev = bumpAdapterSessionRev(meeting, topic.id, agent.id);
      const retryAgentId = pickRetryAgent(meta.agentId || OPENCLAW_AGENT_ID, OPENCLAW_FALLBACK_AGENT_ID);
      const retry = await callOpenClaw(
        retryPrompt,
        Math.max(35, pickOpenClawTimeoutSec(meeting, "host_interrupt")),
        adapterSessionId(meeting.id, topic.id, agent.id, nextRev),
        retryAgentId,
        "minimal"
      );
      content = String(retry.content || content);
      meta = {
        ...meta,
        adapter: "openclaw",
        agentId: retryAgentId,
        retried: true,
        retryReason: "lookup_gate_retry",
        usage: retry.meta?.usage || meta.usage || null,
      };
      if (shouldRetryLookupGate(meeting, topic, content)) {
        content = "检索门禁未通过，系统已阻止不完整答案。正在继续检索并补齐覆盖后再答复。";
        meta = { ...meta, blockedByLookupGate: true };
      }
    } catch (e) {
      addEvent(
        meeting,
        "turn.adapter.error",
        { topicId: topic.id, speakerId: agent.id, adapter: "openclaw", phase: "lookup_gate_retry", error: String(e?.message || e) },
        topic.id
      );
      content = "检索门禁重试失败，系统已阻止直接给出不完整结论。请稍后重试或缩小查询范围。";
      meta = { ...meta, adapter: "openclaw", blockedByLookupGate: true, retryReason: "lookup_gate_retry_failed" };
    }
  }
  const liveTopic = getTopic(meeting, topic.id);
  if (!liveTopic || liveTopic.state !== "active" || meeting.runtime.currentTopicId !== topic.id) {
    addEvent(meeting, "turn.dropped", { topicId: topic.id, speakerId: agent.id, reason: "topic_not_active_anymore" }, topic.id);
    return { emitted: false, dropped: true };
  }
  if (reason === "round-robin" && isDuplicateSpeakerMessage(meeting, topic.id, agent.id, content, 2)) {
    meeting.runtime.noNewInfoStreak += 1;
    pm(meeting);
    addEvent(meeting, "turn.skipped", { topicId: topic.id, speakerId: agent.id, reason: "duplicate_content", adapter: meta.adapter }, topic.id);
    return { emitted: false, skipped: true };
  }
  addMessage(meeting, { topicId: topic.id, speakerId: agent.id, content, kind: "utterance", meta });
  if (needsHostDecision(content)) {
    meeting.runtime.paused = true;
    meeting.runtime.autoPaused = true;
    pm(meeting);
    addEvent(meeting, "meeting.paused", { reason: "await_host_decision", speakerId: agent.id, speakerName: agent.name }, topic.id);
  }
  meeting.runtime.noNewInfoStreak = noNewInfo(meeting, topic, content) ? meeting.runtime.noNewInfoStreak + 1 : 0;
  return { emitted: true };
}

async function runNextTurn(meetingId, reason = "round-robin") {
  const meeting = getMeeting(meetingId);
  if (!meeting || meeting.runtime.paused || meeting.status !== "active") return;
  if (meeting.runtime.turnInFlight) {
    meeting.runtime.pendingTurnReason = reason || "queued_while_inflight";
    pm(meeting);
    return;
  }
  const topic = getCurrentTopic(meeting);
  if (!topic || topic.state !== "active") return;
  const maxRounds = Math.max(20, Number(meeting.policy.maxRounds || 0));
  if (topic.round >= maxRounds) {
    summarizeTopic(meeting, topic, "max_rounds");
    return;
  }
  const agents = activeAgents(meeting);
  if (!agents.length) return;
  let idx = meeting.runtime.nextAgentCursor % agents.length;
  let agent = agents[idx];
  const balanced = pickNextAgentBalanced(meeting, topic, agents, reason);
  if (balanced?.picked) {
    agent = balanced.picked;
    idx = Math.max(0, agents.findIndex((a) => a.id === agent.id));
    addEvent(
      meeting,
      "turn.strategy",
      {
        topicId: topic.id,
        reason,
        strategy: "balanced",
        picked: agent.name,
        codexTurns: balanced.codexTotal,
        openclawTurns: balanced.openclawTotal,
      },
      topic.id
    );
  } else {
    const preferFastFirst = reason === "host_interrupt" || reason === "topic_started";
    if (preferFastFirst) {
      const fastIdx = agents.findIndex((a) => !isOpenClawAgent(a));
      if (fastIdx >= 0) idx = fastIdx;
    } else if (reason === "round-robin") {
      const chosen = agents[idx];
      const fastIdx = agents.findIndex((a) => !isOpenClawAgent(a));
      if (fastIdx >= 0 && isOpenClawAgent(chosen) && topic.round % OPENCLAW_CADENCE !== OPENCLAW_CADENCE - 1) {
        idx = fastIdx;
      }
    }
    agent = agents[idx];
  }
  meeting.runtime.nextAgentCursor = (idx + 1) % agents.length;
  meeting.runtime.turnInFlight = true;
  pm(meeting);
  try {
    await runAgentTurn(meeting, topic, agent, reason);
  } finally {
    meeting.runtime.turnInFlight = false;
  }
  const pendingReason = meeting.runtime.pendingTurnReason;
  meeting.runtime.pendingTurnReason = null;
  if (topic.state !== "active") {
    pm(meeting);
    return;
  }
  topic.round += 1;
  topic.updatedAt = nowIso();
  pt(meeting.id, topic);
  pm(meeting);
  if (meeting.runtime.noNewInfoStreak >= NO_NEW_INFO_PAUSE_STREAK) {
    addEvent(
      meeting,
      "meeting.notice",
      { reason: "no_new_info_streak_reset", streak: meeting.runtime.noNewInfoStreak, threshold: NO_NEW_INFO_PAUSE_STREAK },
      topic.id
    );
    meeting.runtime.noNewInfoStreak = 0;
    pm(meeting);
  }
  if (meeting.runtime.paused) return;
  if (pendingReason) scheduleNextTurn(meeting, pendingReason);
  else if (meeting.policy.autoRoundRobin !== false) scheduleNextTurn(meeting, "round-robin");
}

function startTopic(meeting, topicId, options = {}) {
  const autoRun = !!options.autoRun;
  const startReason = options.reason || "manual_start";
  const topic = getTopic(meeting, topicId);
  if (!topic || topic.state === "closed") return;
  if (topic.state === "active" && meeting.runtime.currentTopicId === topic.id) return;

  const current = getCurrentTopic(meeting);
  if (current && current.id !== topic.id && current.state === "active") {
    summarizeTopic(meeting, current, "switch_topic");
  }

  topic.state = "active";
  if (!topic.startedAt) topic.startedAt = nowIso();
  topic.updatedAt = nowIso();
  topic.round = topic.round || 0;
  meeting.runtime.currentTopicId = topic.id;
  meeting.runtime.noNewInfoStreak = 0;
  meeting.runtime.pendingTurnReason = null;
  meeting.runtime.autoPaused = false;
  pt(meeting.id, topic);
  pm(meeting);
  addEvent(meeting, "topic.started", { topicId: topic.id, title: topic.title, reason: startReason }, topic.id);
  if (autoRun && !meeting.runtime.paused) scheduleNextTurn(meeting, "topic_started");
}

async function forceSpeakerTurn(meeting, topic, speaker) {
  meeting.runtime.turnInFlight = true;
  pm(meeting);
  try {
    await runAgentTurn(meeting, topic, speaker, "force_speaker");
  } finally {
    meeting.runtime.turnInFlight = false;
  }
  const pendingReason = meeting.runtime.pendingTurnReason;
  meeting.runtime.pendingTurnReason = null;
  if (topic.state !== "active") {
    pm(meeting);
    return;
  }
  topic.round += 1;
  topic.updatedAt = nowIso();
  pt(meeting.id, topic);
  pm(meeting);
  if (meeting.runtime.noNewInfoStreak >= NO_NEW_INFO_PAUSE_STREAK) {
    addEvent(
      meeting,
      "meeting.notice",
      { reason: "no_new_info_streak_reset", streak: meeting.runtime.noNewInfoStreak, threshold: NO_NEW_INFO_PAUSE_STREAK },
      topic.id
    );
    meeting.runtime.noNewInfoStreak = 0;
    pm(meeting);
  }
  if (meeting.runtime.paused) return;
  if (pendingReason) scheduleNextTurn(meeting, pendingReason);
  else if (meeting.policy.autoRoundRobin !== false) scheduleNextTurn(meeting, "round-robin");
}

const compactMeeting = (m) => ({ id: m.id, title: m.title, status: m.status, createdAt: m.createdAt, participantCount: m.participants.length, topicCount: m.topics.length });

function resolveTopicForHostMessage(meeting, topicId) {
  let topic = getTopic(meeting, topicId || meeting.runtime.currentTopicId);
  if (!topic) return { error: "No active topic" };
  if (topic.state === "closed") return { error: "Topic is closed, create a new one" };
  if (topic.state === "queued") {
    const current = getCurrentTopic(meeting);
    if (current && current.id !== topic.id) {
      return { error: "Another topic is active, end it or start this topic explicitly" };
    }
    startTopic(meeting, topic.id, { autoRun: false, reason: "message_on_queued_topic" });
    topic = getTopic(meeting, topic.id);
  }
  if (!topic || topic.state !== "active") return { error: "Topic is not active" };
  return { topic };
}

app.get("/api/meetings", (_req, res) => res.json({ meetings: [...store.meetings.values()].map(compactMeeting) }));

app.post("/api/meetings", (req, res) => {
  const meeting = createMeeting(String(req.body?.title || "Agent Meeting Room"));
  res.status(201).json({ meeting: compactMeeting(meeting) });
});

app.get("/api/meetings/:meetingId", (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  res.json({
    meeting: {
      ...compactMeeting(m),
      policy: m.policy,
      runtime: {
        paused: m.runtime.paused,
        autoPaused: !!m.runtime.autoPaused,
        currentTopicId: m.runtime.currentTopicId,
        noNewInfoStreak: m.runtime.noNewInfoStreak,
        pendingTurnReason: m.runtime.pendingTurnReason || null,
        turnInFlight: m.runtime.turnInFlight,
      },
      participants: m.participants,
      topics: m.topics,
    },
  });
});

app.get("/api/meetings/:meetingId/timeline", (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  res.json({
    meetingId: m.id,
    title: m.title,
    participants: m.participants,
    topics: m.topics,
    messages: m.messages,
    events: m.events,
    policy: m.policy,
    runtime: {
      paused: m.runtime.paused,
      autoPaused: !!m.runtime.autoPaused,
      currentTopicId: m.runtime.currentTopicId,
      noNewInfoStreak: m.runtime.noNewInfoStreak,
      pendingTurnReason: m.runtime.pendingTurnReason || null,
      turnInFlight: m.runtime.turnInFlight,
    },
  });
});

app.post("/api/meetings/:meetingId/participants", (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const p = createParticipant(String(req.body?.name || "New Agent").trim(), String(req.body?.type || "agent").trim(), String(req.body?.role || "guest").trim());
  m.participants.push(p);
  pp(m.id, p);
  addEvent(m, "participant.added", p);
  res.status(201).json({ participant: p });
});

app.post("/api/meetings/:meetingId/topics", (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const topic = {
    id: mkId("topic"),
    title: String(req.body?.title || "Untitled topic").trim(),
    state: "queued",
    round: 0,
    createdBy: req.body?.createdById || m.participants[0]?.id,
    createdAt: nowIso(),
    startedAt: null,
    closedAt: null,
    updatedAt: nowIso(),
  };
  m.topics.push(topic);
  pt(m.id, topic);
  addEvent(m, "topic.created", topic, topic.id);
  if (!m.runtime.currentTopicId && !m.runtime.paused) startTopic(m, topic.id, { autoRun: false, reason: "auto_activate_new_topic" });
  res.status(201).json({ topic });
});

app.post("/api/meetings/:meetingId/messages", (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const resolved = resolveTopicForHostMessage(m, req.body?.topicId);
  if (resolved.error) return res.status(400).json({ error: resolved.error });
  const topic = resolved.topic;

  const speakerId = req.body?.speakerId || m.participants[0]?.id;
  const speaker = getParticipant(m, speakerId);
  if (!speaker) return res.status(400).json({ error: "Invalid speaker" });
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ error: "Empty content" });
  const message = addMessage(m, { topicId: topic.id, speakerId, content, targetId: req.body?.targetId || null, kind: req.body?.kind || "utterance", meta: { fromUi: true } });
  if (speaker.type === "user") {
    if (m.runtime.paused && m.runtime.autoPaused) {
      m.runtime.paused = false;
      m.runtime.autoPaused = false;
      pm(m);
      addEvent(m, "meeting.resumed", { reason: "host_replied_after_decision_pause" }, topic.id);
    }
    if (m.policy.hostPriority) scheduleNextTurn(m, "host_interrupt");
  }
  res.status(201).json({ message });
});

app.post("/api/meetings/:meetingId/uploads", upload.single("file"), (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const resolved = resolveTopicForHostMessage(m, req.body?.topicId);
  if (resolved.error) return res.status(400).json({ error: resolved.error });
  const topic = resolved.topic;

  const speakerId = req.body?.speakerId || m.participants[0]?.id;
  const speaker = getParticipant(m, speakerId);
  if (!speaker) return res.status(400).json({ error: "Invalid speaker" });

  const attachment = {
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname || req.file.filename,
    mime: req.file.mimetype || "application/octet-stream",
    size: Number(req.file.size || 0),
  };
  const isImage = attachment.mime.startsWith("image/");
  const caption = String(req.body?.caption || "").trim();
  const content = caption || (isImage ? `上传了图片：${attachment.name}` : `上传了文件：${attachment.name}`);
  const message = addMessage(m, {
    topicId: topic.id,
    speakerId,
    content,
    kind: isImage ? "image" : "file",
    meta: { fromUi: true, attachment },
  });

  if (speaker.type === "user") {
    if (m.runtime.paused && m.runtime.autoPaused) {
      m.runtime.paused = false;
      m.runtime.autoPaused = false;
      pm(m);
      addEvent(m, "meeting.resumed", { reason: "host_replied_after_decision_pause" }, topic.id);
    }
    if (m.policy.hostPriority) scheduleNextTurn(m, "host_interrupt");
  }
  res.status(201).json({ message });
});

app.post("/api/meetings/:meetingId/control", async (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const action = String(req.body?.action || "").trim();
  const topic = getCurrentTopic(m);

  if (action === "pause") {
    m.runtime.paused = true;
    m.runtime.autoPaused = false;
    pm(m);
    addEvent(m, "meeting.paused", {}, m.runtime.currentTopicId);
    return res.json({ ok: true });
  }
  if (action === "resume") {
    m.runtime.paused = false;
    m.runtime.autoPaused = false;
    pm(m);
    addEvent(m, "meeting.resumed", {}, m.runtime.currentTopicId);
    if (m.runtime.currentTopicId) scheduleNextTurn(m, "resume");
    return res.json({ ok: true });
  }
  if (action === "next_turn") {
    await runNextTurn(m.id, "manual_next");
    return res.json({ ok: true });
  }
  if (action === "force_speaker") {
    if (!topic) return res.status(400).json({ error: "No active topic" });
    if (m.runtime.turnInFlight) return res.status(409).json({ error: "Another turn is running, try again shortly" });
    const speakerId = req.body?.speakerId;
    const speakerName = String(req.body?.speakerName || "").trim();
    const speaker = (speakerId ? getParticipant(m, speakerId) : null) || m.participants.find((p) => p.name.toLowerCase() === speakerName.toLowerCase());
    if (!speaker || speaker.type !== "agent") return res.status(400).json({ error: "Invalid agent speaker" });
    await forceSpeakerTurn(m, topic, speaker);
    return res.json({ ok: true });
  }
  if (action === "end_topic") {
    if (!topic) return res.status(400).json({ error: "No active topic" });
    summarizeTopic(m, topic, "host_end_topic");
    return res.json({ ok: true });
  }
  if (action === "start_topic") {
    const topicId = req.body?.topicId;
    if (!topicId) return res.status(400).json({ error: "topicId required" });
    startTopic(m, topicId, { autoRun: false, reason: "host_start_topic" });
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "Unknown action" });
});

app.use((err, _req, res, next) => {
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: `Upload failed: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const meetingId = u.searchParams.get("meetingId");
  if (!meetingId || !getMeeting(meetingId)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.meetingId = meetingId;
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  const mid = ws.meetingId;
  ensureBucket(mid).add(ws);
  const m = getMeeting(mid);
  sendWs(ws, "connected", {
    meetingId: mid,
    runtime: {
      paused: m.runtime.paused,
      autoPaused: !!m.runtime.autoPaused,
      currentTopicId: m.runtime.currentTopicId,
      noNewInfoStreak: m.runtime.noNewInfoStreak,
      pendingTurnReason: m.runtime.pendingTurnReason || null,
      turnInFlight: m.runtime.turnInFlight,
    },
    policy: m.policy,
  });
  ws.on("close", () => ensureBucket(mid).delete(ws));
});

for (const [id, meeting] of storage.load()) store.meetings.set(id, meeting);
let seed = null;
if (store.meetings.size === 0) seed = createMeeting("OpenClaw x Codex Agent Meeting Room");

const port = Number(process.env.PORT || 5077);
server.listen(port, () => {
  const openclawPrimary = pickPrimaryAgent(OPENCLAW_AGENT_ID, OPENCLAW_FALLBACK_AGENT_ID);
  console.log(`Server running on http://localhost:${port}`);
  console.log(
    `OpenClaw adapter: ${OPENCLAW_BIN} (openclaw=${openclawPrimary}, openclawFallback=${OPENCLAW_FALLBACK_AGENT_ID}); codexMode=${CODEX_MODE}; codexFullRelease=${CODEX_FULL_RELEASE}; turnStrategy=${TURN_STRATEGY}; codexStrength=${CODEX_STRENGTH}; codexDeepRoundRobin=${CODEX_DEEP_ROUND_ROBIN}`
  );
  console.log(`Codex CLI workdir: ${CODEX_CLI_WORKDIR}`);
  console.log(`SQLite: ${storage.path} (limit=${storage.maxMb}MB, current=${(storage.sizeBytes() / (1024 * 1024)).toFixed(2)}MB)`);
  if (seed) console.log(`Seed meeting id: ${seed.id}`);
  else console.log(`Loaded meetings from SQLite: ${store.meetings.size}`);
});


