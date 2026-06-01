import { loadState, renderShellStatus, renderStocks, renderFutures, renderChat, startPage, money, escapeHtml } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  document.querySelector(".hero-band h1").textContent = state.world.name;
  document.querySelector(".hero-band p").textContent = state.world.premise;
  renderStocks(state.stocks.slice(0, 4), "#stocks");
  renderFutures(state.futures, "#futures");
  renderChat(state.messages.slice(0, 8), "#chat");
  document.querySelector("#insightCard").innerHTML = `
    <b>${escapeHtml(state.external?.insight?.title || "丁元英式提醒")}</b>
    <p>${escapeHtml(state.external?.insight?.text || "先看清系统，再决定出手。")}</p>
    <small>属性：${escapeHtml(state.external?.insight?.attribute || "识局")}</small>
  `;
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
  document.querySelector("#missionPreview").innerHTML = state.missions.slice(0, 3).map((mission) => `
    <article class="mission-card ${mission.done ? "done" : ""}">
      <div><b>${escapeHtml(mission.title)}</b><span>${mission.value}/${mission.target}</span></div>
      <small>${mission.claimed ? "已领取" : mission.done ? "可领取" : "进行中"}</small>
    </article>
  `).join("");
}

startPage(render);
