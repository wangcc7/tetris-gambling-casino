import { loadState, renderShellStatus, startPage, money, escapeHtml } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  const groups = [
    ["试炼王者 · 消除行数", state.leaderboards.daily],
    ["赌神榜 · 净盈利", state.leaderboards.profit],
    ["暴发户榜 · 战场分数", state.leaderboards.jackpot],
    ["沉沦榜 · 被收割次数", state.leaderboards.harvested]
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
