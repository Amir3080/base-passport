const API = "https://base-journey-api.amirtrider1381.workers.dev";
const LIVE_URL = "https://amir3080.github.io/base-passport/";
const $ = (id) => document.getElementById(id);

const walletForm = $("walletForm");
const walletInput = $("walletInput");
const resultsSection = $("resultsSection");
const loadingSection = $("loadingSection");
const errorBox = $("errorBox");
let current = null;
let toastTimer = null;

walletForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const address = walletInput.value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return showError("Enter a valid Base / EVM address (0x + 40 hex characters).");
  }
  await buildPassport(address);
});

$("pasteBtn").addEventListener("click", async () => {
  try {
    if (navigator.clipboard?.readText && window.isSecureContext) {
      const text = await navigator.clipboard.readText();
      if (text) {
        walletInput.value = text.trim();
        walletInput.focus();
        return showToast("Pasted");
      }
    }
  } catch {}
  walletInput.focus();
  showToast("Press Ctrl + V to paste");
});

$("newSearchBtn").addEventListener("click", () => {
  current = null;
  resultsSection.classList.add("hidden");
  walletInput.value = "";
  clearError();
  walletInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("copyAddressBtn").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.address);
    showToast("Address copied");
  } catch {
    showToast("Could not copy");
  }
});

$("shareBtn").addEventListener("click", () => {
  if (!current) return;
  const r = current;
  const who = r.basename || shortAddress(r.address);
  const text =
`🛂 My Base Passport

${who}
${r.level.emoji} ${r.level.name}
🧭 Exploration Index: ${r.score}/100
📆 ${r.activeMonths} active months
🤝 ${r.uniqueContacts} unique contacts
⚡ ${r.capped ? r.txCount + "+" : r.txCount} transactions
🔥 ${r.bestStreak}-day best streak
🏷️ ${r.stamps.length} passport stamps

Open yours ↓
${LIVE_URL}

Built by @amirshonnm`;

  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer"
  );
});

$("downloadBtn").addEventListener("click", async () => {
  if (!current || typeof html2canvas === "undefined") return;
  const btn = $("downloadBtn");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Creating PNG...";
  try {
    const canvas = await html2canvas($("passportExport"), {
      scale: 1.5,
      backgroundColor: "#d9d0ad",
      useCORS: true,
      logging: false
    });
    const a = document.createElement("a");
    a.download = `base-passport-${current.address.slice(0, 8)}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  } catch (err) {
    console.error(err);
    showError("Could not export the passport image.");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

async function buildPassport(address) {
  clearError();
  resultsSection.classList.add("hidden");
  loadingSection.classList.remove("hidden");
  walletForm.querySelector("button[type='submit']").disabled = true;
  $("loadingText").textContent = "Reading your travel history…";

  try {
    const wallet = await fetchJSON(
      `${API}/wallet?address=${encodeURIComponent(address)}`,
      25000
    );

    $("loadingText").textContent = "Stamping passport pages…";

    const result = analyze({
      address,
      transactions: Array.isArray(wallet.transactions) ? wallet.transactions : [],
      balanceWei: wallet.balanceWei || "0",
      capped: Boolean(wallet.capped)
    });

    current = result;
    render(result);

    loadingSection.classList.add("hidden");
    resultsSection.classList.remove("hidden");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

    resolveBasename(address).then((name) => {
      if (!name || !current || current.address.toLowerCase() !== address.toLowerCase()) return;
      current.basename = name;
      $("displayName").textContent = name;
      current.stamps = buildStamps(current);
      renderStamps(current.stamps);
      $("stampCount").textContent = `${current.stamps.length} collected`;
      showToast(`Basename found: ${name}`);
    }).catch(() => {});

    loadGas(address).catch(() => {
      if (current && current.address.toLowerCase() === address.toLowerCase()) {
        $("gasSpent").textContent = "Unavailable";
      }
    });

  } catch (err) {
    console.error(err);
    loadingSection.classList.add("hidden");
    showError(`Could not open this passport. ${err?.message || err}`);
  } finally {
    walletForm.querySelector("button[type='submit']").disabled = false;
  }
}

function analyze({ address, transactions, balanceWei, capped }) {
  const me = address.toLowerCase();
  const valid = transactions.filter(tx => tx && Number(tx.timeStamp) > 0);

  const dayCounts = {};
  const monthCounts = {};
  const contactCounts = new Map();
  let ethMovedWei = 0n;

  for (const tx of valid) {
    const ts = Number(tx.timeStamp) * 1000;
    const d = new Date(ts);
    const day = d.toISOString().slice(0, 10);
    const month = d.toISOString().slice(0, 7);
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    monthCounts[month] = (monthCounts[month] || 0) + 1;
    ethMovedWei += safeBigInt(tx.value);

    const from = String(tx.from || "").toLowerCase();
    const to = String(tx.to || "").toLowerCase();
    const other = from === me ? to : from;
    if (other && other !== me && /^0x[a-f0-9]{40}$/.test(other)) {
      contactCounts.set(other, (contactCounts.get(other) || 0) + 1);
    }
  }

  const days = Object.keys(dayCounts).sort();
  const months = Object.keys(monthCounts).sort();
  const oldest = days.length ? new Date(`${days[0]}T00:00:00Z`) : null;
  const ageDays = oldest ? Math.floor((Date.now() - oldest.getTime()) / 86400000) : 0;
  const bestStreak = calculateBestStreak(days);
  const activeDays = days.length;
  const activeMonths = months.length;
  const uniqueContacts = contactCounts.size;
  const txCount = valid.length;

  const topContacts = [...contactCounts.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8)
    .map(([address, count]) => ({ address, count }));

  const score = calculateExplorationScore({
    ageDays, txCount, activeDays, activeMonths, uniqueContacts, bestStreak
  });

  const level = getLevel(score);

  const r = {
    address,
    basename: null,
    capped,
    balanceWei: safeBigInt(balanceWei),
    txCount,
    activeDays,
    activeMonths,
    uniqueContacts,
    oldest,
    ageDays,
    bestStreak,
    ethMovedWei,
    monthCounts,
    topContacts,
    score,
    level,
    gasSpentWei: 0n
  };

  r.stamps = buildStamps(r);
  r.summary = buildSummary(r);
  return r;
}

function calculateExplorationScore({ ageDays, txCount, activeDays, activeMonths, uniqueContacts, bestStreak }) {
  const age = Math.min(16, ageDays / 1095 * 16);
  const tx = Math.min(20, Math.log10(txCount + 1) / Math.log10(1501) * 20);
  const days = Math.min(20, activeDays / 250 * 20);
  const months = Math.min(14, activeMonths / 24 * 14);
  const contacts = Math.min(20, Math.log10(uniqueContacts + 1) / Math.log10(251) * 20);
  const streak = Math.min(10, bestStreak / 30 * 10);
  return Math.max(0, Math.min(100, Math.round(age + tx + days + months + contacts + streak)));
}

function getLevel(score) {
  if (score >= 84) return { name: "BASE NATIVE", emoji: "👑" };
  if (score >= 64) return { name: "RESIDENT", emoji: "🏠" };
  if (score >= 38) return { name: "EXPLORER", emoji: "🧭" };
  return { name: "VISITOR", emoji: "🛂" };
}

function buildStamps(r) {
  const out = [];
  const add = (emoji, title, note) => out.push({ emoji, title, note });

  if (r.basename?.toLowerCase().endsWith(".base.eth")) add("🔵","BASENAME","Onchain identity");
  if (r.oldest?.getUTCFullYear() === 2023) add("🌱","2023 ENTRY","Early Base arrival");
  else if (r.ageDays >= 730) add("🕰️","EARLY ENTRY","2+ years on Base");

  if (r.ageDays >= 365) add("🎂","ONE YEAR","365+ days since entry");
  if (r.txCount >= 1000) add("⚡","1K TX CLUB","1,000+ transactions");
  else if (r.txCount >= 500) add("⚡","500 TX","Heavy activity");
  else if (r.txCount >= 100) add("⚡","100 TX","Active wallet");

  if (r.activeMonths >= 24) add("📆","24 MONTHS","Long-term presence");
  else if (r.activeMonths >= 12) add("📆","12 MONTHS","A year of activity");
  else if (r.activeMonths >= 6) add("📆","6 MONTHS","Returning explorer");

  if (r.uniqueContacts >= 200) add("🤝","200 CONTACTS","Wide Base network");
  else if (r.uniqueContacts >= 100) add("🤝","100 CONTACTS","Networked wallet");
  else if (r.uniqueContacts >= 25) add("🤝","25 CONTACTS","Growing network");

  if (r.bestStreak >= 30) add("🔥","30-DAY STREAK","Daily Base traveler");
  else if (r.bestStreak >= 14) add("🔥","14-DAY STREAK","Consistent activity");
  else if (r.bestStreak >= 7) add("🔥","7-DAY STREAK","Weekly streak");

  const moved = Number(formatEth(r.ethMovedWei, 6));
  if (moved >= 25) add("◇","25 ETH MOVED","High native volume");
  else if (moved >= 10) add("◇","10 ETH MOVED","Strong native volume");
  else if (moved >= 1) add("◇","1 ETH MOVED","Native value moved");

  if (!out.length) add("🔵","FIRST STAMP","Passport activated");
  return out.slice(0, 8);
}

function buildSummary(r) {
  if (!r.txCount) return "A fresh passport waiting for its first Base border stamp.";
  if (r.level.name === "BASE NATIVE") {
    return `Deep Base identity: ${r.activeMonths} active months, ${r.uniqueContacts} unique contacts and ${r.txCount} recorded transactions.`;
  }
  if (r.level.name === "RESIDENT") {
    return `A returning Base resident with ${r.activeDays} active days across ${r.activeMonths} different months.`;
  }
  if (r.uniqueContacts >= 50) {
    return `An expanding Base explorer connected to ${r.uniqueContacts} unique onchain addresses.`;
  }
  return `A growing Base footprint with ${r.txCount} transactions across ${r.activeDays} active days.`;
}

function render(r) {
  $("displayName").textContent = shortAddress(r.address);
  $("addressShort").textContent = shortAddressLong(r.address);
  $("passportId").textContent = `BP-${r.address.slice(2,8).toUpperCase()}`;
  $("machineLine").textContent = `BASE<PASSPORT<${r.address.slice(2,14).toUpperCase()}<<<${String(r.score).padStart(3,"0")}<`;
  $("statusStamp").textContent = r.level.name;
  $("portraitIcon").textContent = r.level.emoji;
  $("firstEntry").textContent = r.oldest ? formatDate(r.oldest) : "No activity";
  $("activeMonths").textContent = r.activeMonths;
  $("uniqueContacts").textContent = formatNumber(r.uniqueContacts);
  $("txCount").textContent = r.capped ? `${formatNumber(r.txCount)}+` : formatNumber(r.txCount);
  $("explorationScore").textContent = r.score;
  $("scoreBar").style.width = `${r.score}%`;
  $("passportSummary").textContent = r.summary;
  $("bestStreak").textContent = `${r.bestStreak} days`;
  $("streakBadge").textContent = `🔥 ${r.bestStreak}-day streak`;
  $("activeDays").textContent = formatNumber(r.activeDays);
  $("ethMoved").textContent = `${formatEth(r.ethMovedWei)} ETH`;
  $("gasSpent").textContent = "Calculating…";
  $("stampCount").textContent = `${r.stamps.length} collected`;
  $("explorerLink").href = `https://basescan.org/address/${encodeURIComponent(r.address)}`;

  renderStamps(r.stamps);
  renderMonths(r.monthCounts);
  renderContacts(r.topContacts);
}

function renderStamps(stamps) {
  const box = $("stamps");
  box.innerHTML = "";
  stamps.forEach((s) => {
    const el = document.createElement("div");
    el.className = "stamp";
    el.innerHTML = `<span class="emoji">${escapeHtml(s.emoji)}</span><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.note)}</small>`;
    box.appendChild(el);
  });
}

function renderMonths(monthCounts) {
  const box = $("monthBars");
  box.innerHTML = "";
  const months = lastTwelveMonths();
  const max = Math.max(1, ...months.map(m => Number(monthCounts[m.key] || 0)));

  months.forEach((m) => {
    const count = Number(monthCounts[m.key] || 0);
    const height = count ? Math.max(6, Math.round(count / max * 100)) : 2;
    const col = document.createElement("div");
    col.className = "month-col";
    col.innerHTML = `
      <b>${count}</b>
      <div class="bar-wrap"><div class="month-bar" style="height:${height}%"></div></div>
      <small>${m.label}</small>`;
    box.appendChild(col);
  });
}

function renderContacts(contacts) {
  const box = $("contactList");
  box.innerHTML = "";
  if (!contacts.length) {
    box.innerHTML = `<div class="contact"><div class="contact-rank">—</div><code>No contacts yet</code><strong>0 tx</strong></div>`;
    return;
  }

  contacts.forEach((c, i) => {
    const el = document.createElement("div");
    el.className = "contact";
    el.innerHTML = `
      <div class="contact-rank">${i + 1}</div>
      <code>${escapeHtml(shortAddressLong(c.address))}</code>
      <strong>${c.count} tx</strong>`;
    box.appendChild(el);
  });
}

async function loadGas(address) {
  const data = await fetchJSON(`${API}/gas?address=${encodeURIComponent(address)}`, 120000);
  if (!current || current.address.toLowerCase() !== address.toLowerCase()) return;
  current.gasSpentWei = safeBigInt(data.gasSpentWei || "0");
  $("gasSpent").textContent = `${data.complete === false ? "≥ " : ""}${formatEth(current.gasSpentWei)} ETH`;
}

async function resolveBasename(address) {
  try {
    const [{ createPublicClient, http, toCoinType }, { mainnet, base }] =
      await Promise.all([
        import("https://esm.sh/viem@2"),
        import("https://esm.sh/viem@2/chains")
      ]);

    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://ethereum-rpc.publicnode.com", { timeout: 2500 })
    });

    const name = await Promise.race([
      client.getEnsName({
        address,
        coinType: toCoinType(base.id),
        gatewayUrls: ["https://ccip.ens.xyz"]
      }),
      new Promise(resolve => setTimeout(() => resolve(null), 4500))
    ]);

    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

async function fetchJSON(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error("API did not return valid JSON."); }

    if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("Request timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function calculateBestStreak(days) {
  if (!days.length) return 0;
  let best = 1, currentStreak = 1;
  for (let i = 1; i < days.length; i++) {
    const a = new Date(`${days[i-1]}T00:00:00Z`);
    const b = new Date(`${days[i]}T00:00:00Z`);
    const diff = Math.round((b-a)/86400000);
    if (diff === 1) {
      currentStreak += 1;
      best = Math.max(best, currentStreak);
    } else if (diff > 1) currentStreak = 1;
  }
  return best;
}

function lastTwelveMonths() {
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: d.toISOString().slice(0,7),
      label: d.toLocaleString("en", { month:"short", timeZone:"UTC" }).slice(0,3)
    });
  }
  return out;
}

function safeBigInt(v) {
  try { return BigInt(v ?? 0); } catch { return 0n; }
}

function formatEth(wei, decimals = 4) {
  wei = safeBigInt(wei);
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = (wei % base).toString().padStart(18,"0").slice(0,decimals).replace(/0+$/,"");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function formatNumber(v) {
  return Number(v || 0).toLocaleString("en-US");
}

function formatDate(d) {
  return new Intl.DateTimeFormat("en", {
    year:"numeric", month:"short", day:"numeric", timeZone:"UTC"
  }).format(d);
}

function shortAddress(a) { return `${a.slice(0,7)}...${a.slice(-5)}`; }
function shortAddressLong(a) { return `${a.slice(0,10)}...${a.slice(-8)}`; }

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function showError(msg) { errorBox.textContent = msg; }
function clearError() { errorBox.textContent = ""; }
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}
