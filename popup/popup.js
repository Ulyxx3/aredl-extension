const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1SWvuA9hZmD624AdBRoWJKKT4IxFwugRMgnxQLAJn3zg/edit?usp=sharing";

document.addEventListener("DOMContentLoaded", async () => {
  const sheetUrlInput = document.getElementById("sheetUrl");
  const syncBtn = document.getElementById("syncBtn");
  const statusEl = document.getElementById("status");
  const statsInfo = document.getElementById("statsInfo");
  const levelsCountEl = document.getElementById("levelsCount");
  const lastSyncTimeEl = document.getElementById("lastSyncTime");

  // Load stored settings
  const data = await chrome.storage.local.get(["sheetUrl", "aredlCompletedLevels", "lastSync"]);
  
  if (data.sheetUrl) {
    sheetUrlInput.value = data.sheetUrl;
  } else {
    sheetUrlInput.value = DEFAULT_SHEET_URL;
  }

  if (data.aredlCompletedLevels) {
    displayStats(Object.keys(data.aredlCompletedLevels).length, data.lastSync);
  }

  syncBtn.addEventListener("click", async () => {
    const url = sheetUrlInput.value.trim();
    if (!url) {
      showStatus("Veuillez saisir une URL valide", "error");
      return;
    }

    syncBtn.disabled = true;
    showStatus("Synchronisation en cours...", "info");

    try {
      const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        throw new Error("L'URL du Google Spreadsheet n'est pas valide.");
      }

      const sheetId = sheetIdMatch[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error("Impossible de récupérer les données du spreadsheet. Assurez-vous qu'il est accessible.");
      }

      const csvText = await response.text();
      const levelsMap = parseSheetCSV(csvText);

      const count = Object.keys(levelsMap).length;
      const now = new Date().toLocaleString("fr-FR");

      await chrome.storage.local.set({
        sheetUrl: url,
        aredlCompletedLevels: levelsMap,
        lastSync: now
      });

      // Transmettre le message au tab actif s'il est sur aredl.net
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes("aredl.net")) {
        chrome.tabs.sendMessage(tab.id, { action: "RELOAD_STATS" }).catch(() => {});
      }

      displayStats(count, now);
      showStatus(`Succès ! ${count} niveaux synchronisés.`, "success");
    } catch (err) {
      console.error(err);
      showStatus(err.message || "Erreur lors de la synchronisation.", "error");
    } finally {
      syncBtn.disabled = false;
    }
  });

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status-msg ${type}`;
    statusEl.style.display = "block";
  }

  function displayStats(count, lastSync) {
    statsInfo.style.display = "flex";
    levelsCountEl.textContent = count;
    lastSyncTimeEl.textContent = lastSync || "Inconnu";
  }

  // Simple CSV Parser adapté à la structure du Spreadsheet AREDL
  function parseSheetCSV(csvText) {
    const lines = parseCSVRows(csvText);
    if (lines.length < 3) return {};

    // Structure réelle du CSV :
    // Col 0: Rank/Top
    // Col 1: Name
    // Col 2: Attempts
    // Col 3: Worst Fail
    // Col 4: Enjoy
    // Col 5: Rating
    // Col 6: Note

    const nameIdx = 1;
    const attemptsIdx = 2;
    const worstFailIdx = 3;
    const enjoyIdx = 4;
    const ratingIdx = 5;
    const noteIdx = 6;

    const levelsMap = {};

    for (let i = 0; i < lines.length; i++) {
      const row = lines[i];
      if (!row || row.length <= nameIdx) continue;

      const rawName = row[nameIdx] ? row[nameIdx].trim() : "";
      if (!rawName || rawName.toLowerCase() === "name" || rawName.toLowerCase() === "moyenne" || rawName.toLowerCase() === "top") continue;

      const normalizedKey = rawName.toLowerCase().trim();

      const getVal = (idx) => {
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== null && row[idx].trim() !== "") {
          return row[idx].trim();
        }
        return "-";
      };

      levelsMap[normalizedKey] = {
        name: rawName,
        attempts: getVal(attemptsIdx),
        worstFail: getVal(worstFailIdx),
        enjoy: getVal(enjoyIdx),
        rating: getVal(ratingIdx),
        note: getVal(noteIdx)
      };
    }

    return levelsMap;
  }

  // Robust CSV splitting handling quoted text
  function parseCSVRows(text) {
    const results = [];
    const lines = text.split(/\r?\n/);

    for (let line of lines) {
      if (!line.trim()) continue;
      const row = [];
      let insideQuote = false;
      let entry = "";

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          row.push(entry.replace(/^"|"$/g, '').trim());
          entry = "";
        } else {
          entry += char;
        }
      }
      row.push(entry.replace(/^"|"$/g, '').trim());
      results.push(row);
    }
    return results;
  }
});
