import { loadState, renderShellStatus, renderStocks, renderFutures, renderChat, startPage, money, escapeHtml } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  renderStocks(state.stocks.slice(0, 4), "#stocks");
  renderFutures(state.futures, "#futures");
  renderChat(state.messages.slice(0, 8), "#chat");
  document.querySelector("#bankerPool").textContent = money(state.bankerPool);
  document.querySelector("#nextEvent").textContent = state.announcements[0]
    ? `${state.announcements[0].title}：${state.announcements[0].text}`
    : `下个全服事件 ${Math.ceil(state.nextEventIn / 1000)} 秒`;
  document.querySelector("#guildWar").textContent = state.guildWar.status;
  document.querySelector("#bossHp").style.width = `${state.guildBoss.hpPercent}%`;
  document.querySelector("#bossHpText").textContent = `${state.guildBoss.name} ${state.guildBoss.hpPercent}%`;
  document.querySelector("#dailyRanks").innerHTML = state.leaderboards.daily.slice(0, 5).map((item, index) => `
    <li><b>${index + 1}</b><span>${escapeHtml(item.name)}</span><em>${money(item.value)}</em></li>
  `).join("");
}

startPage(render);
