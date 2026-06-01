import { loadState, post, getPlayerId, renderShellStatus, startPage, money, escapeHtml, toast } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  document.querySelector("#guildList").innerHTML = state.guilds.map((g) => `
    <article class="guild-card">
      <h3>${escapeHtml(g.name)}</h3>
      <p>${g.members}/50 人 · 等级 ${g.level} · 金库 ${money(g.treasury)}</p>
      <button data-join="${g.id}">申请加入</button>
    </article>
  `).join("");
  document.querySelector("#guildBoss").innerHTML = `
    <h3>${escapeHtml(state.guildBoss.name)}</h3>
    <p>开放时间 ${state.guildBoss.window} · 当前血量 ${state.guildBoss.hpPercent}%</p>
    <div class="bar"><i style="width:${state.guildBoss.hpPercent}%"></i></div>
  `;
  document.querySelector("#guildWar").innerHTML = `
    <h3>${escapeHtml(state.guildWar.status)}</h3>
    <p>${escapeHtml(state.guildWar.rule)}</p>
  `;
  document.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await post("/api/guild/join", { playerId: getPlayerId(), guildId: btn.dataset.join });
      toast("已提交入会申请");
      render();
    });
  });
}

document.querySelector("#createGuild").addEventListener("click", async () => {
  const name = document.querySelector("#guildName").value.trim();
  if (!name) return;
  await post("/api/guild/create", { playerId: getPlayerId(), name });
  toast("公会已创建，金库开始闻到金币味");
  render();
});

startPage(render);
