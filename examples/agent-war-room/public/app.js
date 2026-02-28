const state = {
  meetingId: null,
  timeline: null,
  meeting: null,
  ws: null,
  selectedTopicId: null,
};

const els = {
  meetingTitle: document.getElementById("meetingTitle"),
  currentTopic: document.getElementById("currentTopic"),
  messageCount: document.getElementById("messageCount"),
  tokenCount: document.getElementById("tokenCount"),
  topicList: document.getElementById("topicList"),
  messageStream: document.getElementById("messageStream"),
  topicForm: document.getElementById("topicForm"),
  topicInput: document.getElementById("topicInput"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  nextTurnBtn: document.getElementById("nextTurnBtn"),
  endTopicBtn: document.getElementById("endTopicBtn"),
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
  const list = await api("/api/meetings");
  if (!list.meetings?.length) {
    const created = await api("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ title: "OpenClaw x Codex Agent Meeting Room" }),
    });
    state.meetingId = created.meeting.id;
  } else {
    state.meetingId = list.meetings[0].id;
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

  if (!state.selectedTopicId) {
    state.selectedTopicId =
      state.meeting.runtime.currentTopicId || state.meeting.topics[state.meeting.topics.length - 1]?.id || null;
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

  state.ws.onmessage = async (event) => {
    const packet = JSON.parse(event.data);
    if (packet.type === "event") {
      await refreshAll();
    }
  };

  state.ws.onclose = () => {
    setTimeout(connectWs, 1200);
  };
}

function bindUi() {
  els.refreshBtn.addEventListener("click", () => refreshAll().catch(handleError));

  els.topicForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = els.topicInput.value.trim();
    if (!title) {
      return;
    }

    try {
      await api(`/api/meetings/${state.meetingId}/topics`, {
        method: "POST",
        body: JSON.stringify({ title, createdById: hostId() }),
      });
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
      await api(`/api/meetings/${state.meetingId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          topicId: selectedTopicId(),
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

  els.pauseBtn.addEventListener("click", () => control("pause"));
  els.resumeBtn.addEventListener("click", () => control("resume"));
  els.nextTurnBtn.addEventListener("click", () => control("next_turn"));
  els.endTopicBtn.addEventListener("click", () => control("end_topic"));

  els.forceBtn.addEventListener("click", async () => {
    const speakerId = els.forceSpeaker.value;
    if (!speakerId) {
      return;
    }

    await control("force_speaker", { speakerId });
  });
}

async function control(action, payload = {}) {
  try {
    await api(`/api/meetings/${state.meetingId}/control`, {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
    });
    await refreshAll();
  } catch (err) {
    handleError(err);
  }
}

function hostId() {
  return state.meeting?.participants.find((p) => p.role === "host")?.id;
}

function selectedTopicId() {
  return state.selectedTopicId || state.meeting?.runtime.currentTopicId;
}

function render() {
  renderStatus();
  renderTopics();
  renderMessages();
  renderForceSpeakerSelect();
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
      <strong>${escapeHtml(topic.title)}</strong><br />
      <small>状态: ${topic.state} | 轮次: ${topic.round}</small>
    `;
    li.addEventListener("click", () => {
      state.selectedTopicId = topic.id;
      renderMessages();
      renderTopics();
    });
    els.topicList.append(li);
  }
}

function renderMessages() {
  const topicId = selectedTopicId();
  const messages = state.timeline.messages.filter((m) => m.topicId === topicId);

  els.messageStream.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "msg system";
    empty.innerHTML = '<div class="msg-body">当前话题暂无发言。</div>';
    els.messageStream.append(empty);
    return;
  }

  for (const msg of messages) {
    const speaker = state.timeline.participants.find((p) => p.id === msg.speakerId);
    const type = speaker?.type || "system";

    const node = document.createElement("article");
    node.className = `msg ${type}`;
    node.innerHTML = `
      <div class="msg-header">
        <strong>${escapeHtml(speaker?.name || "Unknown")}</strong>
        <span>${new Date(msg.createdAt).toLocaleTimeString()}</span>
      </div>
      <div class="msg-body">${escapeHtml(msg.content)}</div>
    `;
    els.messageStream.append(node);
  }

  els.messageStream.scrollTop = els.messageStream.scrollHeight;
}

function renderForceSpeakerSelect() {
  const agents = state.timeline.participants.filter((p) => p.type === "agent");
  els.forceSpeaker.innerHTML = "";
  for (const agent of agents) {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = agent.name;
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

boot().catch(handleError);