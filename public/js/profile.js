import { loadState, post, getPlayerId, renderShellStatus, startPage, money, escapeHtml, toast, setSession, clearSession } from "./shared.js";

async function render() {
  const state = await loadState();
  renderShellStatus(state);
  renderIdentity(state);
  document.querySelector("#profileName").value = state.player.name;
  document.querySelector("#assetStats").innerHTML = `
    <div><span>金币</span><strong>${money(state.player.coins)}</strong></div>
    <div><span>分数</span><strong>${money(state.player.score)}</strong></div>
    <div><span>消除行</span><strong>${money(state.player.lines)}</strong></div>
    <div><span>被收割</span><strong>${money(state.player.harvested)}</strong></div>
  `;
  document.querySelector("#titles").innerHTML = state.player.titles.map((title) => `<b>${escapeHtml(title)}</b>`).join("");
  document.querySelector("#inventory").innerHTML = `
    <div class="asset-row"><b>暴击幸运块</b><span>下一局加成道具</span><em>${money(state.player.inventory?.luckyBlocks || 0)}</em></div>
    <div class="asset-row"><b>皮肤券</b><span>${escapeHtml((state.player.inventory?.skins || []).join("、") || "暂无")}</span><em>${(state.player.inventory?.skins || []).length}</em></div>
  `;
  document.querySelector("#positions").innerHTML = state.player.positions.length
    ? state.player.positions.map((p) => `<div class="asset-row"><b>${escapeHtml(p.code)}</b><span>${escapeHtml(p.type)}</span><em>${money(p.cost)}</em></div>`).join("")
    : `<p class="muted">暂无股票或期货持仓。</p>`;
}

function renderIdentity(state) {
  const identity = state.identity;
  document.querySelector("#identityCard").innerHTML = `
    <div>
      <span>当前身份</span>
      <strong>${escapeHtml(identity.label || "未登录")}</strong>
      <small>${escapeHtml(identity.identityNo)}</small>
    </div>
    <div>
      <span>账号</span>
      <strong>${escapeHtml(identity.username || "未登录")}</strong>
      <small>${identity.username ? "账号数据由 MySQL 保存" : "请注册或登录后开始游戏"}</small>
    </div>
    <div>
      <span>角色状态</span>
      <strong>${escapeHtml(identity.status)}</strong>
      <small>创建于 ${escapeHtml(state.player.createdAt || "-")}</small>
    </div>
  `;
  document.querySelector("#registerAccount").disabled = Boolean(identity.username);
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

document.querySelector("#registerAccount").addEventListener("click", async () => {
  try {
    const data = await post("/api/auth/register", {
      username: document.querySelector("#registerUser").value,
      password: document.querySelector("#registerPass").value,
      displayName: document.querySelector("#registerName").value
    });
    setSession(data.session);
    toast("注册成功，已登录账号");
    render();
  } catch {
    toast("注册失败：账号可能已存在，或密码太短");
  }
});

document.querySelector("#loginAccount").addEventListener("click", async () => {
  try {
    const data = await post("/api/auth/login", {
      username: document.querySelector("#loginUser").value,
      password: document.querySelector("#loginPass").value
    });
    setSession(data.session);
    toast("登录成功，已进入账号档案");
    render();
  } catch {
    toast("登录失败：账号或密码错误");
  }
});

document.querySelector("#logoutAccount").addEventListener("click", () => {
  clearSession();
  localStorage.removeItem("casinoPlayerId");
  toast("已退出账号");
  setTimeout(() => location.reload(), 600);
});

startPage(render);
