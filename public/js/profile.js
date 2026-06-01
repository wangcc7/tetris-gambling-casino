import { loadState, post, getPlayerId, renderShellStatus, startPage, money, escapeHtml, toast } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  document.querySelector("#profileName").value = state.player.name;
  document.querySelector("#assetStats").innerHTML = `
    <div><span>金币</span><strong>${money(state.player.coins)}</strong></div>
    <div><span>分数</span><strong>${money(state.player.score)}</strong></div>
    <div><span>消除行</span><strong>${money(state.player.lines)}</strong></div>
    <div><span>被收割</span><strong>${money(state.player.harvested)}</strong></div>
  `;
  document.querySelector("#titles").innerHTML = state.player.titles.map((title) => `<b>${escapeHtml(title)}</b>`).join("");
  document.querySelector("#positions").innerHTML = state.player.positions.length
    ? state.player.positions.map((p) => `<div class="asset-row"><b>${escapeHtml(p.code)}</b><span>${escapeHtml(p.type)}</span><em>${money(p.cost)}</em></div>`).join("")
    : `<p class="muted">暂无股票或期货持仓。</p>`;
}

document.querySelector("#saveProfile").addEventListener("click", async () => {
  await post("/api/player", { playerId: getPlayerId(), name: document.querySelector("#profileName").value });
  toast("资料已保存");
  render();
});

document.querySelector("#dailySign").addEventListener("click", async () => {
  await post("/api/player/signin", { playerId: getPlayerId() });
  toast("签到成功，金币到账");
  render();
});

startPage(render);
