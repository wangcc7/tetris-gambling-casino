import { loadState, post, getPlayerId, renderShellStatus, renderChat, startPage, escapeHtml } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  renderChat(state.messages, "#chat");
  document.querySelector("#npcList").innerHTML = state.npcs.map((npc) => `
    <article class="npc-card"><b>${escapeHtml(npc.name)}</b><span>${escapeHtml(npc.personality)}</span><small>${escapeHtml(npc.strategy)}</small></article>
  `).join("");
}

document.querySelector("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#chatInput");
  if (!input.value.trim()) return;
  await post("/api/chat", { playerId: getPlayerId(), text: input.value.trim() });
  input.value = "";
  render();
});

document.querySelector("#redPacket").addEventListener("click", async () => {
  await post("/api/chat/red-packet", { playerId: getPlayerId(), amount: 100, count: 5 });
  render();
});

startPage(render, 1800);
