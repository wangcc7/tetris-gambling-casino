import { loadState, renderShellStatus, startPage, money, escapeHtml } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  const groups = [
    ["韭菜王者", state.leaderboards.daily],
    ["赌神榜", state.leaderboards.profit],
    ["暴发户榜", state.leaderboards.jackpot],
    ["黑奴榜", state.leaderboards.harvested]
  ];
  document.querySelector("#rankGroups").innerHTML = groups.map(([title, rows]) => `
    <section class="panel">
      <h2>${title}</h2>
      <ol class="rank-list">
        ${rows.map((r, i) => `<li><b>${i + 1}</b><span>${escapeHtml(r.name)}</span><em>${money(r.value)}</em></li>`).join("")}
      </ol>
    </section>
  `).join("");
}

startPage(render);
