import { loadState, post, getPlayerId, renderShellStatus, startPage, money, escapeHtml, toast } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  document.querySelector("#missions").innerHTML = state.missions.map((mission) => `
    <article class="mission-card ${mission.done ? "done" : ""}">
      <div>
        <b>${escapeHtml(mission.title)}</b>
        <span>${escapeHtml(mission.desc)}</span>
        <small>${mission.value}/${mission.target} · 奖励 ${money(mission.reward)} 金币</small>
      </div>
      <button data-claim="${mission.id}" ${mission.done && !mission.claimed ? "" : "disabled"}>${mission.claimed ? "已领取" : "领取"}</button>
    </article>
  `).join("");
  document.querySelector("#shop").innerHTML = state.shop.map((item) => `
    <article class="shop-card">
      <div><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.desc)}</span><small>${money(item.price)} 金币</small></div>
      <button data-buy="${item.id}">购买</button>
    </article>
  `).join("");
  document.querySelector("#campaigns").innerHTML = state.campaigns.map((item) => `
    <article class="campaign-card">
      <b>${escapeHtml(item.title)}</b>
      <span>${escapeHtml(item.time)}</span>
      <small>${escapeHtml(item.reward)} · ${escapeHtml(item.status)}</small>
    </article>
  `).join("");
  document.querySelector("#persistence").textContent = state.persistence.enabled
    ? `存档已开启：${state.persistence.stateFile}`
    : "当前为临时内存状态";
  bindActions();
}

function bindActions() {
  document.querySelectorAll("[data-claim]").forEach((button) => {
    button.addEventListener("click", async () => {
      await post("/api/missions/claim", { playerId: getPlayerId(), missionId: button.dataset.claim });
      toast("任务奖励已到账");
      render();
    });
  });
  document.querySelectorAll("[data-buy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await post("/api/shop/buy", { playerId: getPlayerId(), itemId: button.dataset.buy });
      toast("商店购买成功");
      render();
    });
  });
}

startPage(render);
