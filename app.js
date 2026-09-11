const BASE_PATH = "/Treasury";
const SITE_URL = "https://zafrirz.github.io/Treasury";
const REPOSITORY = "zafrirz/Treasury";
const BRANCH = "main";
const HEADERS = ["שם המשחק", "סדר היעדים", "שם היעד", "הוראות הגעה", "תיאור היעד", "חידה", "תשובה לחידה", "שם היעד באנגלית", "כתובת העמוד"];
const FIELDS = ["game", "order", "targetName", "directions", "description", "riddle", "answer", "englishName", "pageUrl", "slug"];

let currentConfig = { activeGame: "", sheetName: "יעדים", rows: [] };
let loadedWorkbook = null;
let parsedRows = [];
let validationErrors = [];

const elements = {
  activeGame: document.querySelector("#active-game"),
  targetGrid: document.querySelector("#target-grid"),
  download: document.querySelector("#download-current"),
  file: document.querySelector("#excel-file"),
  sheet: document.querySelector("#sheet-select"),
  game: document.querySelector("#game-select"),
  validation: document.querySelector("#validation-message"),
  changes: document.querySelector("#changes-summary"),
  token: document.querySelector("#github-token"),
  apply: document.querySelector("#apply-workbook"),
  status: document.querySelector("#apply-status")
};

const asText = value => value == null ? "" : String(value).trim();
const slugify = value => asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const recordKey = row => `${row.game}\u0000${row.slug}`;

async function loadCurrentConfig() {
  const response = await fetch(`${BASE_PATH}/data.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("לא ניתן לטעון את הגדרות המשחק הנוכחיות.");
  currentConfig = await response.json();
  renderHome();
}

function renderHome() {
  elements.activeGame.textContent = currentConfig.activeGame || "לא נבחר משחק פעיל";
  elements.targetGrid.replaceChildren();
  const rows = currentConfig.rows.filter(row => row.game === currentConfig.activeGame).sort((a, b) => a.order - b.order);
  if (!rows.length) {
    elements.targetGrid.textContent = "אין יעדים להצגה במשחק הפעיל.";
    return;
  }
  rows.forEach(row => {
    const link = document.createElement("a");
    link.className = "target-card";
    link.href = `${BASE_PATH}/${row.slug}/`;
    const qr = document.createElement("img");
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&format=svg&margin=10&data=${encodeURIComponent(row.pageUrl)}`;
    qr.alt = `QR עבור ${row.englishName}`;
    const copy = document.createElement("div");
    const step = document.createElement("small");
    step.textContent = `יעד ${row.order}`;
    const title = document.createElement("h3");
    title.textContent = row.targetName;
    const path = document.createElement("p");
    path.textContent = row.englishName;
    copy.append(step, title, path);
    link.append(qr, copy);
    elements.targetGrid.append(link);
  });
}

function setNotice(message, type = "neutral") {
  elements.validation.className = `notice ${type}`;
  elements.validation.textContent = message;
}

function populateSelect(select, values, placeholder) {
  select.replaceChildren();
  if (!values.length) {
    const option = document.createElement("option");
    option.textContent = placeholder;
    select.append(option);
    select.disabled = true;
    return;
  }
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  select.disabled = false;
}

function parseSelectedSheet() {
  validationErrors = [];
  parsedRows = [];
  const sheetName = elements.sheet.value;
  const sheet = loadedWorkbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headerRow = (matrix[0] || []).map(asText);
  const missingHeaders = HEADERS.filter(header => !headerRow.includes(header));
  if (missingHeaders.length) {
    setNotice(`הגיליון אינו תקין. חסרות העמודות: ${missingHeaders.join(", ")}`, "error");
    populateSelect(elements.game, [], "אין משחקים");
    elements.apply.disabled = true;
    return;
  }

  const objects = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  objects.forEach((source, index) => {
    if (!HEADERS.some(header => asText(source[header]))) return;
    const excelRow = index + 2;
    const game = asText(source["שם המשחק"]);
    const englishName = asText(source["שם היעד באנגלית"]);
    const slug = slugify(englishName);
    const order = Number(source["סדר היעדים"]);
    if (!game) validationErrors.push(`שורה ${excelRow}: חסר שם משחק.`);
    if (!asText(source["שם היעד"])) validationErrors.push(`שורה ${excelRow}: חסר שם יעד.`);
    if (!englishName || !slug || !/^[A-Za-z0-9 -]+$/.test(englishName)) validationErrors.push(`שורה ${excelRow}: שם היעד באנגלית יכול להכיל רק אותיות באנגלית, מספרים, רווחים ומקפים.`);
    if (!Number.isFinite(order) || order <= 0) validationErrors.push(`שורה ${excelRow}: סדר היעדים חייב להיות מספר חיובי.`);
    parsedRows.push({
      game,
      order,
      targetName: asText(source["שם היעד"]),
      directions: asText(source["הוראות הגעה"]),
      description: asText(source["תיאור היעד"]),
      riddle: asText(source["חידה"]),
      answer: asText(source["תשובה לחידה"]),
      englishName,
      pageUrl: `${SITE_URL}/${slug}/`,
      slug
    });
  });

  const duplicates = new Set();
  const duplicateOrders = new Set();
  const seen = new Set();
  const seenOrders = new Set();
  parsedRows.forEach(row => {
    const key = recordKey(row);
    if (seen.has(key)) duplicates.add(`${row.game} / ${row.englishName}`);
    seen.add(key);
    const orderKey = `${row.game}\u0000${row.order}`;
    if (seenOrders.has(orderKey)) duplicateOrders.add(`${row.game} / יעד ${row.order}`);
    seenOrders.add(orderKey);
  });
  if (duplicates.size) validationErrors.push(`נמצאו יעדים כפולים: ${[...duplicates].join(", ")}.`);
  if (duplicateOrders.size) validationErrors.push(`נמצא סדר יעד כפול: ${[...duplicateOrders].join(", ")}.`);

  const games = [...new Set(parsedRows.map(row => row.game).filter(Boolean))];
  populateSelect(elements.game, games, "אין משחקים");
  if (games.includes(currentConfig.activeGame)) elements.game.value = currentConfig.activeGame;

  const incomplete = parsedRows.filter(row => !row.riddle || !row.answer).length;
  if (validationErrors.length) {
    setNotice(validationErrors.join(" "), "error");
    elements.apply.disabled = true;
  } else {
    setNotice(`הגיליון תקין. נמצאו ${parsedRows.length} יעדים ו-${games.length} שמות משחקים ללא כפילויות.${incomplete ? ` ל-${incomplete} יעדים חסרה חידה או תשובה.` : ""}`, incomplete ? "warning" : "success");
    elements.apply.disabled = false;
  }
  updateDiffPreview();
}

function diffForGame(game, baseConfig = currentConfig) {
  const incoming = parsedRows.filter(row => row.game === game).sort((a, b) => a.order - b.order);
  const existing = baseConfig.rows.filter(row => row.game === game);
  const existingBySlug = new Map(existing.map(row => [row.slug, row]));
  const incomingBySlug = new Map(incoming.map(row => [row.slug, row]));
  let changedFields = 0;
  let changedRecords = 0;
  let added = 0;
  let removed = 0;
  incoming.forEach(row => {
    const old = existingBySlug.get(row.slug);
    if (!old) { added += 1; return; }
    const changes = FIELDS.filter(field => String(old[field] ?? "") !== String(row[field] ?? ""));
    if (changes.length) { changedRecords += 1; changedFields += changes.length; }
  });
  existing.forEach(row => { if (!incomingBySlug.has(row.slug)) removed += 1; });
  const activeChanged = baseConfig.activeGame !== game;
  return { incoming, added, removed, changedRecords, changedFields, activeChanged, hasChanges: Boolean(added || removed || changedFields || activeChanged) };
}

function updateDiffPreview() {
  if (validationErrors.length || !elements.game.value) {
    elements.changes.hidden = true;
    return;
  }
  const diff = diffForGame(elements.game.value);
  elements.changes.hidden = false;
  elements.changes.textContent = diff.hasChanges
    ? `שינויים שיחולו: ${diff.added} יעדים חדשים, ${diff.removed} יעדים שיוסרו, ${diff.changedRecords} יעדים עם ${diff.changedFields} שדות שהשתנו${diff.activeChanged ? ", וכן החלפת המשחק הפעיל" : ""}.`
    : "הקובץ זהה להגדרה הנוכחית של המשחק. אין צורך לבצע שינוי.";
  elements.apply.disabled = !diff.hasChanges;
}

function mergeOnlyChanges(remoteConfig, game, incoming) {
  const oldRows = remoteConfig.rows || [];
  const oldBySlug = new Map(oldRows.filter(row => row.game === game).map(row => [row.slug, row]));
  const mergedGameRows = incoming.map(row => {
    const old = oldBySlug.get(row.slug);
    if (!old) return row;
    const merged = { ...old };
    FIELDS.forEach(field => {
      if (String(old[field] ?? "") !== String(row[field] ?? "")) merged[field] = row[field];
    });
    return merged;
  });
  return [...oldRows.filter(row => row.game !== game), ...mergedGameRows];
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function textToBase64(text) { return bytesToBase64(new TextEncoder().encode(text)); }
function base64ToText(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function github(path, token, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (options.allow404 && response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `GitHub החזיר שגיאה ${response.status}.`);
  return payload;
}

const encodePath = path => path.split("/").map(encodeURIComponent).join("/");

function targetPageTemplate(label) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#174b3a"><title>${label}</title><link rel="stylesheet" href="/Treasury/styles.css"><script src="/Treasury/target.js" defer><\/script></head><body class="target-page"><a class="home-link" href="/Treasury/">לעמוד הראשי</a><main id="quest-root" class="quest-card" aria-live="polite"><div class="quest-content">טוען את היעד…</div></main></body></html>`;
}

async function applyWorkbook() {
  const game = elements.game.value;
  const diff = diffForGame(game);
  if (!diff.hasChanges) { elements.status.textContent = "לא נמצאו שינויים. האתר לא עודכן."; return; }
  const token = elements.token.value.trim();
  if (!token) { elements.status.textContent = "יש להזין אסימון GitHub לפני ההחלה."; elements.token.focus(); return; }
  const firstApproval = window.confirm(`האם להחיל את הקובץ על המשחק "${game}"?\n\n${elements.changes.textContent}`);
  if (!firstApproval) return;
  const finalApproval = window.confirm("האם אתם בטוחים? זוהי פעולת אל-חזור שתעדכן את תוכן האתר הציבורי.");
  if (!finalApproval) return;

  elements.apply.disabled = true;
  elements.status.textContent = "בודק את המצב הנוכחי ומעדכן רק את השדות שהשתנו…";
  try {
    const dataPath = encodePath("data.json");
    const remoteFile = await github(`contents/${dataPath}?ref=${BRANCH}`, token);
    const remoteConfig = JSON.parse(base64ToText(remoteFile.content));
    const remoteDiff = diffForGame(game, remoteConfig);
    if (!remoteDiff.hasChanges) {
      elements.status.textContent = "האתר כבר מעודכן. לא בוצע שינוי.";
      return;
    }
    remoteConfig.rows = mergeOnlyChanges(remoteConfig, game, remoteDiff.incoming);
    remoteConfig.activeGame = game;
    remoteConfig.sheetName = elements.sheet.value;
    remoteConfig.sourceFile = elements.file.files[0]?.name || remoteConfig.sourceFile;
    remoteConfig.updatedAt = new Date().toISOString();
    await github(`contents/${dataPath}`, token, {
      method: "PUT",
      body: { message: `Update treasure game: ${game}`, content: textToBase64(`${JSON.stringify(remoteConfig, null, 2)}\n`), sha: remoteFile.sha, branch: BRANCH }
    });

    let createdPages = 0;
    for (const row of remoteDiff.incoming) {
      const pagePath = `${row.slug}/index.html`;
      const existingPage = await github(`contents/${encodePath(pagePath)}?ref=${BRANCH}`, token, { allow404: true });
      if (!existingPage) {
        await github(`contents/${encodePath(pagePath)}`, token, {
          method: "PUT",
          body: { message: `Create target page: ${row.englishName}`, content: textToBase64(targetPageTemplate(row.englishName)), branch: BRANCH }
        });
        createdPages += 1;
      }
    }
    currentConfig = remoteConfig;
    renderHome();
    elements.status.textContent = `העדכון נשלח בהצלחה. ${createdPages ? `נוצרו ${createdPages} עמודים חדשים. ` : ""}GitHub Pages עשוי להציג אותו לאחר מספר דקות.`;
    elements.token.value = "";
    updateDiffPreview();
  } catch (error) {
    elements.status.textContent = `העדכון נכשל: ${error.message}`;
  } finally {
    updateDiffPreview();
  }
}

function downloadCurrentWorkbook() {
  if (!window.XLSX) { alert("רכיב Excel עדיין לא נטען. נסו שוב בעוד רגע."); return; }
  const rows = currentConfig.rows.map(row => ({
    "שם המשחק": row.game,
    "סדר היעדים": row.order,
    "שם היעד": row.targetName,
    "הוראות הגעה": row.directions,
    "תיאור היעד": row.description,
    "חידה": row.riddle,
    "תשובה לחידה": row.answer,
    "שם היעד באנגלית": row.englishName,
    "כתובת העמוד": row.pageUrl
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  XLSX.utils.book_append_sheet(workbook, worksheet, currentConfig.sheetName || "יעדים");
  XLSX.writeFile(workbook, "treasure-current.xlsx");
}

elements.file.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (!window.XLSX) throw new Error("רכיב Excel לא נטען. יש לבדוק חיבור לאינטרנט ולנסות שוב.");
    loadedWorkbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    populateSelect(elements.sheet, loadedWorkbook.SheetNames, "אין גיליונות");
    elements.sheet.value = loadedWorkbook.SheetNames.includes("יעדים") ? "יעדים" : loadedWorkbook.SheetNames[0];
    parseSelectedSheet();
  } catch (error) {
    setNotice(`לא ניתן לקרוא את הקובץ: ${error.message}`, "error");
  }
});
elements.sheet.addEventListener("change", parseSelectedSheet);
elements.game.addEventListener("change", updateDiffPreview);
elements.download.addEventListener("click", downloadCurrentWorkbook);
elements.apply.addEventListener("click", applyWorkbook);

loadCurrentConfig().catch(error => {
  elements.activeGame.textContent = "שגיאה בטעינת המשחק";
  elements.targetGrid.textContent = error.message;
});

