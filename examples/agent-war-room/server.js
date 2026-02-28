import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENCLAW_DEFAULT_BIN = process.platform === "win32" ? "openclaw.cmd" : "openclaw";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || OPENCLAW_DEFAULT_BIN;
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || "main";
const OPENCLAW_TIMEOUT_SEC = Number(process.env.OPENCLAW_TIMEOUT_SEC || 45);

const DB_PATH = path.resolve(process.env.AGENT_ROOM_DB_PATH || "D:\\agent-war-room\\meeting-room.sqlite");
const DB_MAX_MB = Number(process.env.AGENT_ROOM_DB_MAX_MB || 50);
const DB_MAX_BYTES = Math.max(5, DB_MAX_MB) * 1024 * 1024;
const DB_PAGE_SIZE = 4096;
const DB_MAX_PAGES = Math.floor(DB_MAX_BYTES / DB_PAGE_SIZE);
const DB_PRUNE_TARGET = Math.floor(DB_MAX_BYTES * 0.9);

const store = { meetings: new Map() };
const clientsByMeeting = new Map();

const defPolicy = () => ({ maxRounds: 6, timeoutSec: 25, hostPriority: true });
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
  currentTopicId: rt?.currentTopicId || null,
  nextAgentCursor: Number(rt?.nextAgentCursor || 0),
  noNewInfoStreak: Number(rt?.noNewInfoStreak || 0),
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
  if (ws.readyState !== ws.OPEN) return;
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
function scheduleNextTurn(meeting, reason) {
  if (meeting.runtime.activeTimer) clearTimeout(meeting.runtime.activeTimer);
  meeting.runtime.activeTimer = setTimeout(() => {
    void runNextTurn(meeting.id, reason).catch((e) => {
      meeting.runtime.turnInFlight = false;
      pm(meeting);
      addEvent(meeting, "turn.error", { reason, error: e instanceof Error ? e.message : String(e) });
    });
  }, 700);
}

function buildAgentReply(meeting, topic, agent) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const last = scoped.at(-1);
  if (agent.name.toLowerCase().includes("codex")) {
    const tail = last ? `上一条消息关注: ${last.content.slice(0, 60)}。` : "";
    return `我从工程实现角度补充。${tail}建议先固定数据模型与 API，再做实时流和回放。最后补控制动作: pause/resume/force_speaker/end_topic。`;
  }
  return `我建议围绕话题“${topic.title}”给出更具体的落地步骤。`;
}
const isOpenClawAgent = (a) => a.name.toLowerCase().includes("openclaw");
function buildOpenClawPrompt(meeting, topic, agent) {
  const scoped = meeting.messages.filter((m) => m.topicId === topic.id);
  const transcript = scoped.slice(-8).map((m) => `${getParticipant(meeting, m.speakerId)?.name || "Unknown"}: ${String(m.content || "").slice(0, 400)}`).join("\n");
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
const extractJson = (raw) => {
  const s = String(raw || "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  return i < 0 || j <= i ? null : s.slice(i, j + 1);
};
function parseOpenClaw(stdout) {
  const j = extractJson(stdout);
  if (!j) throw new Error("OpenClaw returned non-JSON output");
  const data = JSON.parse(j);
  const payloads = Array.isArray(data?.result?.payloads) ? data.result.payloads : [];
  const content = payloads.map((p) => (typeof p?.text === "string" ? p.text.trim() : "")).filter(Boolean).join("\n\n").trim();
  if (!content) throw new Error("OpenClaw response has no text payload");
  return { content, meta: data?.result?.meta?.agentMeta || {} };
}
function callOpenClaw(prompt, timeoutSec) {
  const t = Math.max(10, Number(timeoutSec || OPENCLAW_TIMEOUT_SEC));
  const msg = String(prompt || "").replace(/\s+/g, " ").trim();
  return new Promise((resolve, reject) => {
    const baseArgs = ["agent", "--agent", OPENCLAW_AGENT_ID, "--message", msg, "--json", "--timeout", String(t)];
    const inv = process.platform === "win32" ? { cmd: "cmd.exe", args: ["/d", "/s", "/c", OPENCLAW_BIN, ...baseArgs] } : { cmd: OPENCLAW_BIN, args: baseArgs };
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
      c.kill();
      finish(reject, new Error(`OpenClaw call timed out after ${t}s`));
    }, (t + 5) * 1000);
    c.stdout.on("data", (d) => (out += d.toString()));
    c.stderr.on("data", (d) => (err += d.toString()));
    c.on("error", (e) => {
      clearTimeout(timer);
      finish(reject, e);
    });
    c.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(reject, new Error(`OpenClaw exited with code ${code}: ${String(err || out).trim().slice(-260)}`));
        return;
      }
      try {
        finish(resolve, parseOpenClaw(out));
      } catch (e) {
        finish(reject, new Error(`${e instanceof Error ? e.message : String(e)}; raw=${String(out).trim().slice(-260)}`));
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
  const recent = meeting.messages.filter((m) => m.topicId === topic.id).slice(-4).map((m) => (m.content || "").trim());
  if (recent.includes((content || "").trim())) return true;
  return (content || "").length < 36;
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
    addEvent(meeting, "turn.adapter.request", { topicId: topic.id, speakerId: agent.id, adapter: "openclaw", agentId: OPENCLAW_AGENT_ID }, topic.id);
    try {
      const result = await callOpenClaw(prompt, meeting.policy.timeoutSec || OPENCLAW_TIMEOUT_SEC);
      content = result.content;
      meta = { ...meta, adapter: "openclaw", agentId: OPENCLAW_AGENT_ID, usage: result.meta?.usage || null };
    } catch (e) {
      content = openclawFallback(meeting, topic, e);
      const err = String(e?.message || e);
      meta = { ...meta, adapter: "openclaw", fallback: true, error: err.slice(0, 200) };
      addEvent(meeting, "turn.adapter.error", { speakerId: agent.id, adapter: "openclaw", error: err }, topic.id);
    }
  } else {
    content = buildAgentReply(meeting, topic, agent);
  }
  addMessage(meeting, { topicId: topic.id, speakerId: agent.id, content, kind: "utterance", meta });
  meeting.runtime.noNewInfoStreak = noNewInfo(meeting, topic, content) ? meeting.runtime.noNewInfoStreak + 1 : 0;
}

async function runNextTurn(meetingId, reason = "round-robin") {
  const meeting = getMeeting(meetingId);
  if (!meeting || meeting.runtime.paused || meeting.status !== "active" || meeting.runtime.turnInFlight) return;
  const topic = getCurrentTopic(meeting);
  if (!topic || topic.state !== "active") return;
  if (topic.round >= meeting.policy.maxRounds) {
    summarizeTopic(meeting, topic, "max_rounds");
    return;
  }
  const agents = activeAgents(meeting);
  if (!agents.length) return;
  const idx = meeting.runtime.nextAgentCursor % agents.length;
  const agent = agents[idx];
  meeting.runtime.nextAgentCursor = (idx + 1) % agents.length;
  meeting.runtime.turnInFlight = true;
  pm(meeting);
  try {
    await runAgentTurn(meeting, topic, agent, reason);
  } finally {
    meeting.runtime.turnInFlight = false;
  }
  if (topic.state !== "active") {
    pm(meeting);
    return;
  }
  topic.round += 1;
  topic.updatedAt = nowIso();
  pt(meeting.id, topic);
  pm(meeting);
  if (meeting.runtime.noNewInfoStreak >= 2) {
    summarizeTopic(meeting, topic, "no_new_info");
    return;
  }
  if (!meeting.runtime.paused) scheduleNextTurn(meeting, "round-robin");
}

function startTopic(meeting, topicId) {
  const topic = getTopic(meeting, topicId);
  if (!topic || topic.state === "closed") return;
  topic.state = "active";
  topic.startedAt = nowIso();
  topic.updatedAt = nowIso();
  topic.round = topic.round || 0;
  meeting.runtime.currentTopicId = topic.id;
  meeting.runtime.noNewInfoStreak = 0;
  pt(meeting.id, topic);
  pm(meeting);
  addEvent(meeting, "topic.started", { topicId: topic.id, title: topic.title }, topic.id);
  scheduleNextTurn(meeting, "topic_started");
}

async function forceSpeakerTurn(meeting, topic, speaker) {
  if (meeting.runtime.turnInFlight) return;
  meeting.runtime.turnInFlight = true;
  pm(meeting);
  try {
    await runAgentTurn(meeting, topic, speaker, "force_speaker");
  } finally {
    meeting.runtime.turnInFlight = false;
  }
  if (topic.state !== "active") {
    pm(meeting);
    return;
  }
  topic.round += 1;
  topic.updatedAt = nowIso();
  pt(meeting.id, topic);
  pm(meeting);
  if (!meeting.runtime.paused) scheduleNextTurn(meeting, "after_force");
}

const compactMeeting = (m) => ({ id: m.id, title: m.title, status: m.status, createdAt: m.createdAt, participantCount: m.participants.length, topicCount: m.topics.length });

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
      runtime: { paused: m.runtime.paused, currentTopicId: m.runtime.currentTopicId, noNewInfoStreak: m.runtime.noNewInfoStreak, turnInFlight: m.runtime.turnInFlight },
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
    runtime: { paused: m.runtime.paused, currentTopicId: m.runtime.currentTopicId, noNewInfoStreak: m.runtime.noNewInfoStreak, turnInFlight: m.runtime.turnInFlight },
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
  if (!m.runtime.currentTopicId && !m.runtime.paused) startTopic(m, topic.id);
  res.status(201).json({ topic });
});

app.post("/api/meetings/:meetingId/messages", (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const topic = getTopic(m, req.body?.topicId || m.runtime.currentTopicId);
  if (!topic) return res.status(400).json({ error: "No active topic" });
  const speakerId = req.body?.speakerId || m.participants[0]?.id;
  const speaker = getParticipant(m, speakerId);
  if (!speaker) return res.status(400).json({ error: "Invalid speaker" });
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ error: "Empty content" });
  const message = addMessage(m, { topicId: topic.id, speakerId, content, targetId: req.body?.targetId || null, kind: req.body?.kind || "utterance", meta: { fromUi: true } });
  if (speaker.type === "user" && m.policy.hostPriority) scheduleNextTurn(m, "host_interrupt");
  res.status(201).json({ message });
});

app.post("/api/meetings/:meetingId/control", async (req, res) => {
  const m = getMeeting(req.params.meetingId);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const action = String(req.body?.action || "").trim();
  const topic = getCurrentTopic(m);

  if (action === "pause") {
    m.runtime.paused = true;
    pm(m);
    addEvent(m, "meeting.paused", {}, m.runtime.currentTopicId);
    return res.json({ ok: true });
  }
  if (action === "resume") {
    m.runtime.paused = false;
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
    startTopic(m, topicId);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "Unknown action" });
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
  sendWs(ws, "connected", { meetingId: mid, runtime: m.runtime, policy: m.policy });
  ws.on("close", () => ensureBucket(mid).delete(ws));
});

for (const [id, meeting] of storage.load()) store.meetings.set(id, meeting);
let seed = null;
if (store.meetings.size === 0) seed = createMeeting("OpenClaw x Codex Agent Meeting Room");

const port = Number(process.env.PORT || 5077);
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`OpenClaw adapter: ${OPENCLAW_BIN} (agent=${OPENCLAW_AGENT_ID})`);
  console.log(`SQLite: ${storage.path} (limit=${storage.maxMb}MB, current=${(storage.sizeBytes() / (1024 * 1024)).toFixed(2)}MB)`);
  if (seed) console.log(`Seed meeting id: ${seed.id}`);
  else console.log(`Loaded meetings from SQLite: ${store.meetings.size}`);
});