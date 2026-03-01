const state = {
  meetingId: null,
  timeline: null,
  meeting: null,
  ws: null,
  selectedTopicId: null,
  wsConnected: false,
};

const els = {
  meetingTitle: document.getElementById("meetingTitle"),
  currentTopic: document.getElementById("currentTopic"),
  messageCount: document.getElementById("messageCount"),
  tokenCount: document.getElementById("tokenCount"),
  wsStatus: document.getElementById("wsStatus"),
  topicList: document.getElementById("topicList"),
  messageStream: document.getElementById("messageStream"),
  eventStream: document.getElementById("eventStream"),
  topicForm: document.getElementById("topicForm"),
  topicInput: document.getElementById("topicInput"),
  newMeetingBtn: document.getElementById("newMeetingBtn"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  fileInput: document.getElementById("fileInput"),
  fileCaption: document.getElementById("fileCaption"),
  uploadBtn: document.getElementById("uploadBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  nextTurnBtn: document.getElementById("nextTurnBtn"),
  endTopicBtn: document.getElementById("endTopicBtn"),
  startTopicBtn: document.getElementById("startTopicBtn"),
  forceSpeaker: document.getElementById("forceSpeaker"),
  forceBtn: document.getElementById("forceBtn"),
};

function api(path, init = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  });
}

async function boot() {
  if (window.location.protocol === "file:") {
    throw new Error("请通过 http://localhost:5077 打开，而不是直接双击 index.html。");
  }

  const list = await api("/api/meetings");
  if (!list.meetings?.length) {
    const created = await api("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ title: "OpenClaw x Codex Agent Meeting Room" }),
    });
    state.meetingId = created.meeting.id;
  } else {
    const latest = [...list.meetings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    state.meetingId = latest.id;
  }

  await refreshAll();
  connectWs();
  bindUi();
}

async function refreshAll() {
  const [meetingResp, timelineResp] = await Promise.all([
    api(`/api/meetings/${state.meetingId}`),
    api(`/api/meetings/${state.meetingId}/timeline`),
  ]);

  state.meeting = meetingResp.meeting;
  state.timeline = timelineResp;

  const selectedStillExists = state.selectedTopicId && state.meeting.topics.some((t) => t.id === state.selectedTopicId);
  if (!selectedStillExists) {
    state.selectedTopicId =
      state.meeting.runtime.currentTopicId ||
      state.meeting.topics[state.meeting.topics.length - 1]?.id ||
      null;
  }

  render();
}

function connectWs() {
  if (state.ws) {
    state.ws.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws?meetingId=${encodeURIComponent(state.meetingId)}`;
  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    state.wsConnected = true;
    renderConnectionStatus();
  };

  state.ws.onmessage = async (event) => {
    const packet = JSON.parse(event.data);
    if (packet.type === "event") {
      await refreshAll();
    }
  };

  state.ws.onerror = () => {
    state.wsConnected = false;
    renderConnectionStatus();
  };

  state.ws.onclose = () => {
    state.wsConnected = false;
    renderConnectionStatus();
    setTimeout(connectWs, 1200);
  };
}

function bindUi() {
  els.refreshBtn.addEventListener("click", () => refreshAll().catch(handleError));
  els.newMeetingBtn.addEventListener("click", () => createNewMeeting().catch(handleError));
  els.uploadBtn.addEventListener("click", () => uploadSelectedFile().catch(handleError));

  els.topicForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = els.topicInput.value.trim();
    if (!title) {
      return;
    }

    try {
      const created = await api(`/api/meetings/${state.meetingId}/topics`, {
        method: "POST",
        body: JSON.stringify({ title, createdById: hostId() }),
      });
      state.selectedTopicId = created.topic.id;
      await startTopicSafe(created.topic.id);
      els.topicInput.value = "";
      await refreshAll();
    } catch (err) {
      handleError(err);
    }
  });

  els.messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = els.messageInput.value.trim();
    if (!content) {
      return;
    }

    try {
      const topicId = await ensureReadyTopic(content);
      await api(`/api/meetings/${state.meetingId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          topicId,
          speakerId: hostId(),
          content,
        }),
      });
      els.messageInput.value = "";
      await refreshAll();
    } catch (err) {
      handleError(err);
    }
  });

  els.pauseBtn.addEventListener("click", () => control("pause").catch(handleError));
  els.resumeBtn.addEventListener("click", () => control("resume").catch(handleError));
  els.nextTurnBtn.addEventListener("click", () => control("next_turn").catch(handleError));
  els.endTopicBtn.addEventListener("click", () => control("end_topic").catch(handleError));
  els.startTopicBtn.addEventListener("click", () => {
    const topicId = selectedTopicId();
    if (!topicId) {
      handleError(new Error("请先从左侧选择一个话题。"));
      return;
    }
    startTopicSafe(topicId).catch(handleError);
  });

  els.forceBtn.addEventListener("click", () => {
    const speakerId = els.forceSpeaker.value;
    if (!speakerId) {
      return;
    }

    control("force_speaker", { speakerId }).catch(handleError);
  });
}

async function control(action, payload = {}) {
  await api(`/api/meetings/${state.meetingId}/control`, {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
  await refreshAll();
}

async function createNewMeeting() {
  const created = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({ title: "OpenClaw x Codex Agent Meeting Room" }),
  });
  state.meetingId = created.meeting.id;
  state.selectedTopicId = null;
  await refreshAll();
  connectWs();
}

async function uploadSelectedFile() {
  const file = els.fileInput.files?.[0];
  if (!file) {
    throw new Error("请先选择一个图片或文件。");
  }

  const caption = els.fileCaption.value.trim();
  const topicId = await ensureReadyTopic(caption || `文件: ${file.name}`);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("topicId", topicId);
  formData.append("speakerId", hostId());
  if (caption) formData.append("caption", caption);

  const res = await fetch(`/api/meetings/${state.meetingId}/uploads`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  els.fileInput.value = "";
  els.fileCaption.value = "";
  await refreshAll();
}

function hostId() {
  return state.meeting?.participants.find((p) => p.role === "host")?.id;
}

function selectedTopicId() {
  return state.selectedTopicId || state.meeting?.runtime.currentTopicId;
}

function getTopic(topicId) {
  return state.meeting?.topics.find((t) => t.id === topicId);
}

async function ensureReadyTopic(content) {
  let topicId = selectedTopicId();
  if (!topicId) {
    const title = `新话题: ${String(content || "").slice(0, 18)}`;
    const created = await api(`/api/meetings/${state.meetingId}/topics`, {
      method: "POST",
      body: JSON.stringify({ title, createdById: hostId() }),
    });
    state.selectedTopicId = created.topic.id;
    await refreshAll();
    topicId = created.topic.id;
  }

  const topic = getTopic(topicId);
  if (!topic) {
    throw new Error("选中的话题不存在。");
  }

  if (topic.state === "closed") {
    const title = `新话题: ${String(content || "").slice(0, 18)}`;
    const created = await api(`/api/meetings/${state.meetingId}/topics`, {
      method: "POST",
      body: JSON.stringify({ title, createdById: hostId() }),
    });
    state.selectedTopicId = created.topic.id;
    await startTopicSafe(created.topic.id);
    return created.topic.id;
  }

  if (topic.state === "queued") {
    await startTopicSafe(topic.id);
  }

  return topic.id;
}

async function startTopicSafe(topicId) {
  await control("start_topic", { topicId });
  state.selectedTopicId = topicId;
}

function render() {
  renderStatus();
  renderTopics();
  renderMessages();
  renderEvents();
  renderForceSpeakerSelect();
  renderConnectionStatus();
}

function renderStatus() {
  const meeting = state.meeting;
  const currentTopic = meeting.topics.find((t) => t.id === meeting.runtime.currentTopicId);
  const tokens = state.timeline.messages.reduce((sum, m) => sum + (m.tokenEstimate || 0), 0);

  els.meetingTitle.textContent = meeting.title;
  els.currentTopic.textContent = currentTopic ? currentTopic.title : "无";
  els.messageCount.textContent = String(state.timeline.messages.length);
  els.tokenCount.textContent = String(tokens);
}

function renderConnectionStatus() {
  els.wsStatus.textContent = state.wsConnected ? "在线" : "离线(重连中)";
  els.wsStatus.className = state.wsConnected ? "ws-online" : "ws-offline";
}

function renderTopics() {
  const topics = [...state.meeting.topics].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  els.topicList.innerHTML = "";

  if (!topics.length) {
    const li = document.createElement("li");
    li.className = "topic-item";
    li.innerHTML = "<strong>还没有话题</strong><br /><small>在左上输入框创建第一个讨论议题。</small>";
    els.topicList.append(li);
    return;
  }

  for (const topic of topics) {
    const li = document.createElement("li");
    li.className = `topic-item ${topic.id === selectedTopicId() ? "active" : ""}`;
    li.innerHTML = `
      <div class="topic-row">
        <strong>${escapeHtml(topic.title)}</strong>
        <span class="topic-state state-${topic.state}">${topic.state}</span>
      </div>
      <small>轮次: ${topic.round}</small>
      <div class="topic-actions"></div>
    `;

    const actions = li.querySelector(".topic-actions");
    const canStart =
      topic.state === "queued" &&
      (!state.meeting.runtime.currentTopicId || state.meeting.runtime.currentTopicId === topic.id);

    if (canStart && actions) {
      const startBtn = document.createElement("button");
      startBtn.className = "ghost mini-btn";
      startBtn.type = "button";
      startBtn.textContent = "开始话题";
      startBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await startTopicSafe(topic.id);
        } catch (err) {
          handleError(err);
        }
      });
      actions.append(startBtn);
    }

    li.addEventListener("click", () => {
      state.selectedTopicId = topic.id;
      renderMessages();
      renderEvents();
      renderTopics();
    });
    els.topicList.append(li);
  }
}

function renderMessages() {
  const topicId = selectedTopicId();
  els.messageStream.innerHTML = "";

  if (!topicId) {
    const empty = document.createElement("div");
    empty.className = "msg system";
    empty.innerHTML = '<div class="msg-body">还没有可查看的话题，先在左侧创建一个话题。</div>';
    els.messageStream.append(empty);
    return;
  }

  const topic = getTopic(topicId);
  const messages = state.timeline.messages.filter((m) => m.topicId === topicId);

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "msg system";
    if (topic?.state === "queued") {
      empty.innerHTML = '<div class="msg-body">该话题还未开始。点击“开始选中话题”或话题卡片内“开始话题”。</div>';
    } else if (topic?.state === "closed") {
      empty.innerHTML = '<div class="msg-body">该话题已结束，没有可显示的发言。</div>';
    } else {
      empty.innerHTML = '<div class="msg-body">当前话题暂无发言。</div>';
    }
    els.messageStream.append(empty);
    return;
  }

  for (const msg of messages) {
    const speaker = state.timeline.participants.find((p) => p.id === msg.speakerId);
    const type = speaker?.type || "system";
    const adapter = String(msg?.meta?.adapter || "builtin");
    const attachment = msg?.meta?.attachment;
    let attachmentHtml = "";
    if (attachment?.url) {
      if (msg.kind === "image") {
        attachmentHtml = `
          <div class="msg-attachment">
            <a class="file-link" href="${escapeAttr(attachment.url)}" target="_blank" rel="noreferrer">查看原图: ${escapeHtml(attachment.name || "image")}</a>
            <img class="msg-image" src="${escapeAttr(attachment.url)}" alt="${escapeAttr(attachment.name || "image")}" loading="lazy" />
          </div>
        `;
      } else {
        attachmentHtml = `
          <div class="msg-attachment">
            <a class="file-link" href="${escapeAttr(attachment.url)}" target="_blank" rel="noreferrer">下载文件: ${escapeHtml(attachment.name || "file")}</a>
          </div>
        `;
      }
    }

    const node = document.createElement("article");
    node.className = `msg ${type}`;
    node.innerHTML = `
      <div class="msg-header">
        <div class="msg-title">
          <strong>${escapeHtml(speaker?.name || "Unknown")}</strong>
          <span class="msg-adapter">${escapeHtml(adapter)}</span>
        </div>
        <span>${new Date(msg.createdAt).toLocaleTimeString()}</span>
      </div>
      <div class="msg-body">${escapeHtml(msg.content)}</div>
      ${attachmentHtml}
    `;
    els.messageStream.append(node);
  }

  els.messageStream.scrollTop = els.messageStream.scrollHeight;
}

function renderEvents() {
  const topicId = selectedTopicId();
  const events = state.timeline.events
    .filter((evt) => !topicId || evt.topicId === topicId || evt.topicId === null)
    .slice(-24);

  els.eventStream.innerHTML = "";
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "event-item";
    empty.textContent = "当前范围内暂无事件。";
    els.eventStream.append(empty);
    return;
  }

  for (const evt of events) {
    const item = document.createElement("article");
    item.className = "event-item";
    item.innerHTML = `
      <div class="event-header">
        <strong>${escapeHtml(evt.type)}</strong>
        <span>${new Date(evt.createdAt).toLocaleTimeString()}</span>
      </div>
      <div class="event-body">${escapeHtml(eventSummary(evt))}</div>
    `;
    els.eventStream.append(item);
  }

  els.eventStream.scrollTop = els.eventStream.scrollHeight;
}

function eventSummary(evt) {
  const payload = evt.payload || {};
  if (evt.type === "turn.started") {
    return `${payload.speakerName || "Agent"} 开始发言（原因: ${payload.reason || "round"}）`;
  }
  if (evt.type === "turn.strategy") {
    return `调度策略=${String(payload.strategy || "default")}，本轮选择 ${String(payload.picked || "agent")}`;
  }
  if (evt.type === "topic.created" || evt.type === "topic.started" || evt.type === "topic.closed") {
    return `${payload.title || payload.topicId || ""} ${payload.reason ? `(${payload.reason})` : ""}`.trim();
  }
  if (evt.type === "message.created") {
    const speaker = state.timeline.participants.find((p) => p.id === payload.speakerId);
    const head = speaker ? `${speaker.name}: ` : "";
    return `${head}${String(payload.content || "").slice(0, 88)}`;
  }
  if (evt.type === "turn.adapter.error") {
    const adapter = String(payload.adapter || "adapter");
    return `${adapter} 调用失败: ${String(payload.error || "").slice(0, 88)}`;
  }
  if (evt.type === "turn.adapter.session_reset") {
    return `${String(payload.adapter || "adapter")} 会话已重置（原因: ${String(payload.reason || "unknown")}）`;
  }
  if (evt.type === "turn.adapter.retry") {
    if (payload.reason) return `${String(payload.adapter || "adapter")} 正在重试（${String(payload.reason)}）`;
    return `${String(payload.adapter || "adapter")} 正在重试（rev=${String(payload.rev || 0)}）`;
  }
  if (evt.type === "turn.adapter.discarded") {
    return `${String(payload.adapter || "adapter")} 结果已丢弃（${String(payload.reason || "unknown")}）`;
  }
  if (evt.type === "turn.skipped") {
    return `本轮跳过重复发言（${String(payload.adapter || "adapter")}）`;
  }
  if (evt.type === "turn.dropped") {
    return `本轮结果未入流（${String(payload.reason || "topic_changed")}）`;
  }
  const raw = JSON.stringify(payload);
  return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
}

function renderForceSpeakerSelect() {
  const agents = state.timeline.participants.filter((p) => p.type === "agent");
  const current = els.forceSpeaker.value;
  els.forceSpeaker.innerHTML = "";
  for (const agent of agents) {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = agent.name;
    if (agent.id === current) {
      option.selected = true;
    }
    els.forceSpeaker.append(option);
  }
}

function handleError(err) {
  console.error(err);
  alert(`操作失败: ${err.message}`);
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");
}

function escapeAttr(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

boot().catch(handleError);
