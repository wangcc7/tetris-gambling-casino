import { loadState, post, getPlayerId, renderShellStatus, renderStocks, renderFutures, startPage, money, toast } from "./shared.js";

let latest = null;

async function render() {
  latest = await loadState();
  renderShellStatus(latest);
  renderStocks(latest.stocks, "#stocks");
  renderFutures(latest.futures, "#futures");
  document.querySelector("#portfolio").innerHTML = latest.player.positions.length
    ? latest.player.positions.map((p) => `<div class="asset-row"><b>${p.code}</b><span>${p.side || "持仓"} ${p.qty}</span><em>${money(p.cost)}</em></div>`).join("")
    : `<p class="muted">暂无持仓，适合先围观钟渊表演。</p>`;
  document.querySelector("#marketEvents").innerHTML = latest.marketEvents.map((e) => `<li>${e}</li>`).join("");
}

document.querySelector("#stockBuy").addEventListener("click", async () => {
  const code = document.querySelector("#stockCode").value;
  const lots = Number(document.querySelector("#stockLots").value || 1);
  await post("/api/trade/stock", { playerId: getPlayerId(), code, lots });
  toast("股票委托已成交，T+1 的痛感稍后到达");
  render();
});

document.querySelector("#futureOpen").addEventListener("click", async () => {
  await post("/api/trade/future", {
    playerId: getPlayerId(),
    code: document.querySelector("#futureCode").value,
    side: document.querySelector("#futureSide").value,
    leverage: Number(document.querySelector("#futureLev").value)
  });
  toast("期货仓位已打开，爆仓广播随时待命");
  render();
});

startPage(render);
