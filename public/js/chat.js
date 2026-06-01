import { loadState, post, getPlayerId, renderShellStatus, renderChat, startPage, escapeHtml } from "./shared.js";

let activeChannel = "世界";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  document.querySelector("#worldPremise").textContent = state.world.premise;
  renderChat(state.messages.filter((msg) => (msg.channel || "世界") === activeChannel), "#chat");
  document.querySelector("#npcList").innerHTML = state.npcs.map((npc) => `
    <article class="npc-card"><b>${escapeHtml(npc.name)}</b><span>${escapeHtml(npc.personality)}</span><small>${escapeHtml(npc.strategy)}</small></article>
  `).join("");
}

document.querySelectorAll("[data-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    activeChannel = button.dataset.channel;
    document.querySelectorAll("[data-channel]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

document.querySelector("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#chatInput");
  if (!input.value.trim()) return;
  await post("/api/chat", { playerId: getPlayerId(), text: input.value.trim(), channel: activeChannel });
  input.value = "";
  render();
});

document.querySelector("#redPacket").addEventListener("click", async () => {
  await post("/api/chat/red-packet", { playerId: getPlayerId(), amount: 100, count: 5 });
  render();
});

startPage(render, 1800);
