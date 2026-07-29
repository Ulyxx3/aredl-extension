(function() {
  let completedLevelsMap = {};

  // Charger les données depuis chrome.storage
  function loadStats() {
    chrome.storage.local.get(["aredlCompletedLevels"], (result) => {
      if (result.aredlCompletedLevels) {
        completedLevelsMap = result.aredlCompletedLevels;
        updateUI();
      }
    });
  }

  // Recevoir les messages du popup si une synchro survient
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "RELOAD_STATS") {
      loadStats();
    }
  });

  // Nettoyer et normaliser le nom d'un niveau pour faciliter le matching
  function normalizeName(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, "") // Enlever le créateur entre parenthèses ex: ECSTASY (Filqh) -> ecstasy
      .trim();
  }

  function updateUI() {
    markCompletedLevelsInList();
    displayCurrentLevelStats();
  }

  // 1. Ajouter le badge ✔ dans la liste des niveaux (sidebar de gauche)
  function markCompletedLevelsInList() {
    // Cibler spécifiquement les liens/boutons de la liste de gauche ou tout conteneur ayant un format #Niveau
    const elements = document.querySelectorAll('a, div, button, p, span');

    elements.forEach(item => {
      // Ignorer les éléments trop grands ou ayant trop d'enfants
      if (item.children.length > 3) return;
      if (item.querySelector('.aredl-completed-badge')) return;

      const text = item.innerText ? item.innerText.trim() : "";
      if (!text || text.length > 60) return;

      // Correspondance ex: "#830 Summer Sky" ou "#1 Saul Goodman"
      const match = text.match(/^#(\d+)\s+([^\n]+)$/);
      if (!match) return;

      const levelName = match[2].trim();
      const normalized = normalizeName(levelName);

      if (completedLevelsMap[normalized]) {
        const badge = document.createElement('span');
        badge.className = 'aredl-completed-badge';
        badge.innerHTML = '✔ GG';
        item.appendChild(badge);
      }
    });
  }

  // 2. Afficher la carte de statistiques personnelles sous/sur la fiche du niveau
  function displayCurrentLevelStats() {
    // Chercher le titre principal du niveau (H1 ou H2)
    const headers = document.querySelectorAll('h1, h2, .level-title');
    let titleEl = null;

    for (let el of headers) {
      if (el.innerText && el.innerText.trim().length > 0 && el.innerText.trim().length < 60) {
        titleEl = el;
        break;
      }
    }

    const existingCard = document.querySelector('.aredl-user-stats-card');

    if (!titleEl) {
      if (existingCard) existingCard.remove();
      return;
    }

    const currentLevelName = titleEl.innerText.trim();
    const normalized = normalizeName(currentLevelName);

    const levelData = completedLevelsMap[normalized];

    // Si le niveau N'EST PAS dans le spreadsheet (non complété)
    if (!levelData) {
      if (existingCard) {
        existingCard.remove();
      }
      return;
    }

    // Si la carte est déjà affichée pour ce niveau exact
    if (existingCard) {
      if (existingCard.getAttribute('data-level') === normalized) {
        return;
      } else {
        existingCard.remove();
      }
    }

    // Créer la carte de stats perso
    const card = document.createElement('div');
    card.className = 'aredl-user-stats-card';
    card.setAttribute('data-level', normalized);

    const formatFail = (val) => {
      if (!val || val === '-') return '-';
      return val.includes('%') ? val : `${val}%`;
    };

    card.innerHTML = `
      <div class="aredl-user-stats-header">
        <div class="aredl-user-stats-title">
          <span>✔ MES STATISTIQUES PERSO</span>
        </div>
        <span style="font-size: 11px; color: #a0aec0;">Google Sheet Sync</span>
      </div>
      <div class="aredl-user-stats-grid">
        <div class="aredl-stat-box">
          <div class="aredl-stat-label">Tentatives</div>
          <div class="aredl-stat-value">${levelData.attempts || '-'}</div>
        </div>
        <div class="aredl-stat-box">
          <div class="aredl-stat-label">Pire Fail</div>
          <div class="aredl-stat-value">${formatFail(levelData.worstFail)}</div>
        </div>
        <div class="aredl-stat-box">
          <div class="aredl-stat-label">Enjoyment</div>
          <div class="aredl-stat-value">${levelData.enjoy || '-'}/10</div>
        </div>
        <div class="aredl-stat-box">
          <div class="aredl-stat-label">Rating</div>
          <div class="aredl-stat-value">${levelData.rating || '-'}/10</div>
        </div>
      </div>
      ${levelData.note && levelData.note !== '-' ? `<div class="aredl-user-note">"${levelData.note}"</div>` : ''}
    `;

    // Insérer la carte après le titre du niveau
    if (titleEl.nextSibling) {
      titleEl.parentNode.insertBefore(card, titleEl.nextSibling);
    } else {
      titleEl.parentNode.appendChild(card);
    }
  }

  // Observer les changements du DOM pour réagir aux navigations SPA
  const observer = new MutationObserver(() => {
    updateUI();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Initialisation
  loadStats();
})();
