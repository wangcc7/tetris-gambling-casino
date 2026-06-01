let adminState = null;
let rage = false;

const $ = (selector) => document.querySelector(selector);

async function adminPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`request ${res.status}`);
  return res.json();
}

async function login() {
  const data = await adminPost("/admin/login", {
    user: $("#adminUser").value,
    password: $("#adminPass").value
  });
  if (data.ok) {
    $("#loginBox").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
    refresh();
  } else {
    alert("登录失败");
  }
}

async function action(actionName, payload = {}) {
  await adminPost("/admin/api/action", { action: actionName, payload });
  refresh();
}

async function refresh() {
  const res = await fetch("/admin/api/state");
  if (res.status === 401) return;
  adminState = await res.json();
  $("#serverMeta").textContent = `在线 ${adminState.onlinePlayers} 人 · 钟渊池 ${Math.round(adminState.bankerPool)} · 亏损目标 ${adminState.lossTarget}%`;
  $("#stockSelect").innerHTML = adminState.stocks.map((s) => `<option value="${s.code}">${s.code} ${s.name}</option>`).join("");
  $("#futureSelect").innerHTML = adminState.futures.map((f) => `<option value="${f.code}">${f.code} ${f.name}</option>`).join("");
  $("#playerSelect").innerHTML = adminState.players.map((p) => `<option value="${p.id}">${p.name} · ${Math.round(p.coins)} 金币</option>`).join("") || `<option value="">暂无玩家</option>`;
  $("#lossTarget").value = adminState.lossTarget;
  $("#inflation").value = adminState.inflation;
  $("#adminSnapshot").innerHTML = [
    ["股票数量", adminState.stocks.length],
    ["期货数量", adminState.futures.length],
    ["聊天消息", adminState.messages.length],
    ["正式账号", Object.keys(adminState.accounts || {}).length]
  ].map(([k, v]) => `<div><small>${k}</small><br><b>${v}</b></div>`).join("");
  $("#playerRegistry").innerHTML = adminState.players.map((p) => `
    <article class="registry-row">
      <div><b>${p.name}</b><small>${p.identity.identityNo} · ${p.identity.label}</small></div>
      <div><span>${p.identity.username || "游客"}</span><small>${p.status}</small></div>
      <div><span>${Math.round(p.coins)} 金币</span><small>${p.lines} 行 · ${p.score} 分</small></div>
      <div class="registry-actions">
        <button data-ban="${p.id}">${p.status === "banned" ? "解封" : "封禁"}</button>
        <button data-reset="${p.id}">重置</button>
      </div>
    </article>
  `).join("");
  bindRegistryActions();
}

function bindRegistryActions() {
  document.querySelectorAll("[data-ban]").forEach((button) => {
    button.addEventListener("click", () => {
      const player = adminState.players.find((item) => item.id === button.dataset.ban);
      action("playerStatus", { playerId: button.dataset.ban, status: player.status === "banned" ? "active" : "banned" });
    });
  });
  document.querySelectorAll("[data-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (confirm("确认重置该玩家资产和战绩？账号绑定会保留。")) action("resetPlayer", { playerId: button.dataset.reset });
    });
  });
}

$("#loginBtn").addEventListener("click", login);
$("#stockApply").addEventListener("click", () => action("stock", { code: $("#stockSelect").value, percent: $("#stockPercent").value }));
$("#futureApply").addEventListener("click", () => action("future", { code: $("#futureSelect").value, price: $("#futurePrice").value }));
$("#applyEconomy").addEventListener("click", () => {
  action("lossTarget", { value: $("#lossTarget").value });
  action("inflation", { value: $("#inflation").value });
});
$("#coinApply").addEventListener("click", () => {
  if (!$("#playerSelect").value) return alert("当前没有可操作玩家");
  action("coins", { playerId: $("#playerSelect").value, amount: $("#coinAmount").value });
});
$("#announceApply").addEventListener("click", () => action("announce", { text: $("#announceText").value }));
$("#leekDay").addEventListener("click", () => {
  if (confirm("确认触发终焉日？所有玩家金币减半。")) action("leekDay");
});
$("#rageOn").addEventListener("click", () => {
  rage = !rage;
  action("rage", { enabled: rage });
});
$("#worldEvent").addEventListener("click", () => action("worldEvent"));
$("#saveState").addEventListener("click", () => action("save"));

setInterval(refresh, 3000);
