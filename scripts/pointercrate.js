(function() {
  console.log("[Pointercrate Extension] Initialisation");

  const USER_NAME = "Ulyxx3";
  const USER_NATIONALITY = "FR";
  const USER_NATIONALITY_NAME = "France";
  const USER_SUBDIVISION = "Provence-Alpes-Côte d'Azur";

  let completedLevelsMap = {};
  let demonListCache = null;
  let scoreCache = null;

  function normalizeName(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, "")
      .trim();
  }

  // 🧮 FORMULE OFFICIELLE EXACTE DE DEMONTHEORIZER (2024 onwards)
  function calculateDemonPoints(position, progress = 100, requirement = 100) {
    if (!position || position > 150 || position < 1) return 0;
    if (progress > 100) progress = 100;
    if (progress < requirement && progress < 100) return 0;

    let score = 0;
    if (56 <= position && position <= 150) {
      score = 1.039035131 * ((185.7 * Math.exp(-0.02715 * position)) + 14.84);
    } else if (36 <= position && position <= 55) {
      score = 1.0371139743 * ((212.61 * Math.pow(1.036, (1 - position))) + 25.071);
    } else if (21 <= position && position <= 35) {
      score = ((250 - 83.389) * Math.pow(1.0099685, (2 - position)) - 31.152) * 1.0371139743;
    } else if (4 <= position && position <= 20) {
      score = ((326.1 * Math.exp(-0.0871 * position)) + 51.09) * 1.037117142;
    } else if (1 <= position && position <= 3) {
      score = (-18.2899079915 * position) + 368.2899079915;
    }

    if (progress !== 100) {
      score = (score * Math.pow(5, ((progress - requirement) / (100 - requirement)))) / 10;
    }

    return Math.round(score * 100) / 100;
  }

  function loadStoredStats() {
    chrome.storage.local.get(["aredlCompletedLevels"], (result) => {
      if (result.aredlCompletedLevels) {
        completedLevelsMap = result.aredlCompletedLevels;
        runEnhancements();
      }
    });
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "RELOAD_STATS") {
      loadStoredStats();
    }
  });

  async function fetchDemonList() {
    if (demonListCache) return demonListCache;
    try {
      // Endpoint Pointercrate v2 avec pagination exacte DemonTheorizer (pageSize 75, totalSize 150)
      const [res1, res2] = await Promise.all([
        fetch("https://pointercrate.com/api/v2/demons/listed/?limit=75&after=0"),
        fetch("https://pointercrate.com/api/v2/demons/listed/?limit=75&after=75")
      ]);

      let list = [];
      if (res1.ok) {
        const d1 = await res1.json();
        list = list.concat(d1);
      }
      if (res2.ok) {
        const d2 = await res2.json();
        list = list.concat(d2);
      }

      // S'assurer de ne garder strictement que le Top 150 (position <= 150)
      list = list.filter(d => d.position <= 150);

      if (list.length > 0) {
        demonListCache = list;
        return demonListCache;
      }
    } catch (e) {
      console.warn("[Pointercrate Extension] Erreur API demons v2, fallback v1...");
    }

    try {
      const res = await fetch("https://pointercrate.com/api/v1/demons/listed?limit=150");
      if (res.ok) {
        const d = await res.json();
        demonListCache = d.filter(item => item.position <= 150);
        return demonListCache;
      }
    } catch (e) {
      console.error("[Pointercrate Extension] Erreur API demons :", e);
    }
    return [];
  }

  async function fetchLeaderboardCache() {
    if (scoreCache) return scoreCache;
    try {
      const res = await fetch("https://cf-worker.finite-weeb.xyz/rankcache/pointercrate/leaderboard");
      if (res.ok) {
        scoreCache = await res.json();
        return scoreCache;
      }
    } catch (e) {
      console.warn("[Pointercrate Extension] Fallback ranking API:", e);
    }

    try {
      const res = await fetch("https://pointercrate.com/api/v1/players/ranking?limit=250");
      if (res.ok) {
        scoreCache = await res.json();
        return scoreCache;
      }
    } catch (e) {
      console.error("[Pointercrate Extension] Erreur API rankings :", e);
    }
    return [];
  }

  // 1. SURLIGNAGE DEMONLIST PRINCIPALE
  function highlightCompletedDemonsInDemonlist() {
    if (window.location.href.includes("statsviewer")) return;
    if (Object.keys(completedLevelsMap).length === 0) return;

    const headers = document.querySelectorAll('h1, h2, h3, h4, h5');

    headers.forEach(h => {
      const text = h.innerText ? h.innerText.trim() : "";
      if (!text || text.length > 70) return;

      const match = text.match(/^#(\d+)\s*(?:–|-|\.)?\s*([^\n\r]+)$/);
      if (!match) return;

      const levelName = match[2].trim();
      const normName = normalizeName(levelName);

      const card = h.closest('.panel, .entry, div, li, a') || h.parentElement;

      if (completedLevelsMap[normName]) {
        if (card) card.classList.add('pointercrate-completed-demon');

        const allBadges = (card || h).querySelectorAll('.pointercrate-completed-badge');
        if (allBadges.length === 0) {
          const badge = document.createElement('span');
          badge.className = 'pointercrate-completed-badge';
          badge.textContent = '✔ GG';
          h.appendChild(badge);
        } else if (allBadges.length > 1) {
          for (let i = 1; i < allBadges.length; i++) {
            allBadges[i].remove();
          }
        }
      }
    });
  }

  // 2. STATS VIEWER
  async function setupStatsViewer() {
    if (!window.location.href.includes("statsviewer")) return;
    if (Object.keys(completedLevelsMap).length === 0) return;

    const demons = await fetchDemonList();
    const leaderboard = await fetchLeaderboardCache();

    const mainDemons = [];
    const extendedDemons = [];
    const legacyDemons = [];
    const allDemonsProcessed = [];
    let totalPoints = 0;

    const listedDemonsMap = {};
    demons.forEach(d => {
      listedDemonsMap[normalizeName(d.name)] = d;
    });

    demons.forEach(demon => {
      const norm = normalizeName(demon.name);
      if (completedLevelsMap[norm]) {
        const pts = calculateDemonPoints(demon.position, 100, demon.requirement || 100);
        const demonData = {
          id: demon.id,
          name: demon.name,
          position: demon.position,
          points: pts,
          isMain: demon.position <= 75,
          isExtended: demon.position > 75 && demon.position <= 150,
          isLegacy: false
        };
        allDemonsProcessed.push(demonData);
        if (demonData.isMain) {
          mainDemons.push(demonData);
        } else {
          extendedDemons.push(demonData);
        }
        totalPoints += pts;
      }
    });

    Object.keys(completedLevelsMap).forEach(normKey => {
      if (!listedDemonsMap[normKey]) {
        const originalName = completedLevelsMap[normKey].name || normKey;
        const legacyData = {
          id: null,
          name: originalName,
          position: 9999,
          points: 0,
          isMain: false,
          isExtended: false,
          isLegacy: true
        };
        allDemonsProcessed.push(legacyData);
        legacyDemons.push(legacyData);
      }
    });

    totalPoints = Math.round(totalPoints * 100) / 100;

    let estimatedRank = 1;
    if (leaderboard && leaderboard.length > 0) {
      for (let i = 0; i < leaderboard.length; i++) {
        const entryScore = leaderboard[i].score || 0;
        if (totalPoints < entryScore) {
          estimatedRank = (leaderboard[i].rank || (i + 1)) + 1;
        } else {
          break;
        }
      }
    }

    const topRanked = [...mainDemons, ...extendedDemons].sort((a, b) => a.position - b.position);
    const hardestName = topRanked.length > 0 ? topRanked[0].name : "None";
    const hardestPos = topRanked.length > 0 ? topRanked[0].position : null;

    const statsSummary = {
      rank: estimatedRank,
      score: totalPoints,
      hardest: hardestName,
      hardestPosition: hardestPos,
      mainCount: mainDemons.length,
      extendedCount: extendedDemons.length,
      legacyCount: legacyDemons.length,
      allDemons: allDemonsProcessed
    };

    injectUserInSelectionList(statsSummary);
    bindSearchFilter();
    hookDemonSortingChange(statsSummary);
  }

  // 3. INJECTION DANS UL.SELECTION-LIST (EXACT NATIVE LI FORMAT)
  function injectUserInSelectionList(stats) {
    const selectionList = document.querySelector('ul.selection-list');
    if (!selectionList) return;

    let userLi = document.getElementById('pointercrate-user-item-ulyxx3');
    if (!userLi) {
      userLi = document.createElement('li');
      userLi.id = 'pointercrate-user-item-ulyxx3';
      userLi.className = 'white hover';
      userLi.setAttribute('data-id', 'custom-ulyxx3');
      userLi.setAttribute('data-name', USER_NAME.toLowerCase());
      userLi.setAttribute('data-rank', stats.rank);

      // Structure native stricte : span.flag-icon + b (#rank) + " name " + i (score)
      userLi.innerHTML = `<span class="flag-icon" title="France" style="background-image: url(&quot;/static/demonlist/images/flags/fr.svg&quot;);"></span><b>#${stats.rank}</b> ${USER_NAME} <i>${stats.score.toFixed(2)}</i>`;

      userLi.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        selectionList.querySelectorAll('li').forEach(li => {
          li.classList.remove('selected', 'active');
        });
        userLi.classList.add('selected');

        renderIntoViewerContent(stats);
      });

      insertUserAtCorrectRank(selectionList, userLi, stats.rank);
    } else {
      if (!selectionList.contains(userLi)) {
        insertUserAtCorrectRank(selectionList, userLi, stats.rank);
      }
      const bRank = userLi.querySelector('b');
      if (bRank) bRank.textContent = `#${stats.rank}`;
      const iScore = userLi.querySelector('i');
      if (iScore) iScore.textContent = `${stats.score.toFixed(2)}`;
    }
  }

  function insertUserAtCorrectRank(list, item, rank) {
    const children = Array.from(list.children);
    let inserted = false;

    for (const child of children) {
      if (child === item) continue;
      const text = child.innerText || "";
      const match = text.match(/#(\d+)/);
      if (match) {
        const childRank = parseInt(match[1], 10);
        if (childRank >= rank) {
          list.insertBefore(item, child);
          inserted = true;
          break;
        }
      }
    }

    if (!inserted) {
      list.appendChild(item);
    }
  }

  function bindSearchFilter() {
    const searchInput = document.querySelector('input[placeholder*="search" i], .search input, input[type="text"]');
    if (!searchInput) return;

    if (searchInput.getAttribute('data-ulyxx-bound')) return;
    searchInput.setAttribute('data-ulyxx-bound', 'true');

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const userItem = document.getElementById('pointercrate-user-item-ulyxx3');
      if (!userItem) return;

      if (!q || USER_NAME.toLowerCase().includes(q) || q === 'ulyxx3' || q === 'ulyxx' || 'france'.includes(q) || 'fr'.includes(q)) {
        userItem.style.display = 'block';
      } else {
        userItem.style.display = 'none';
      }
    });
  }

  function hookDemonSortingChange(stats) {
    const sortingDropdowns = document.querySelectorAll('select, .dropdown');
    sortingDropdowns.forEach(d => {
      if (d.getAttribute('data-sorting-hooked')) return;
      d.setAttribute('data-sorting-hooked', 'true');
      d.addEventListener('change', () => {
        const userLi = document.getElementById('pointercrate-user-item-ulyxx3');
        if (userLi && userLi.classList.contains('selected')) {
          renderIntoViewerContent(stats);
        }
      });
    });
  }

  function getActiveSortingOrder() {
    const selects = document.querySelectorAll('select, div.dropdown');
    for (const s of selects) {
      const parent = s.closest('.panel, div');
      if (parent && parent.innerText.includes('Demon Sorting')) {
        const val = s.value || s.innerText || "";
        if (val.toLowerCase().includes('placement') || val.toLowerCase().includes('position')) {
          return 'placement';
        }
      }
    }
    return 'alphabetical';
  }

  // 4. RENDU AVEC LA STRUCTURE ET TYPOGRAPHIE 100% NATIVE DE POINTERCRATE
  function renderIntoViewerContent(stats) {
    const viewerContent = document.querySelector('div.viewer-content');
    if (!viewerContent) return;

    viewerContent.style.display = 'block';
    const viewerWelcome = document.querySelector('.viewer-welcome');
    if (viewerWelcome) viewerWelcome.style.display = 'none';

    let flexCol = viewerContent.querySelector('div.flex.col');
    if (!flexCol) {
      flexCol = viewerContent;
    }

    const sorting = getActiveSortingOrder();
    const sortedDemons = [...stats.allDemons];

    if (sorting === 'placement') {
      sortedDemons.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    } else {
      sortedDemons.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Typographie exacte Pointercrate DOM :
    // - Wrapper : <span id="beaten">
    // - Main (<=75) : <b><a href="...">Nom</a></b> (les CSS .stats-container b appliquent font-size: 110% et font-weight: bolder)
    // - Extended (76-150) : <span><a href="...">Nom</a></span> (les CSS .stats-container :not(b) appliquent font-size: 90%)
    // - Legacy (>150 / sheet) : <i style="opacity: 0.5;">Nom</i> (les CSS appliquent font-size: 90% et l'italique avec opacité 0.5)
    const demonsListHtml = sortedDemons.length > 0 
      ? sortedDemons.map((d, index) => {
          const isLast = index === sortedDemons.length - 1;
          const separator = isLast ? '' : ' - ';
          
          if (d.isMain) {
            return `<b><a href="/demonlist/${d.position}/">${d.name}</a></b>${separator}`;
          } else if (d.isExtended) {
            return `<span><a href="/demonlist/${d.position}/">${d.name}</a></span>${separator}`;
          } else if (d.isLegacy) {
            return `<i style="font-size: 81%; opacity: 0.5;">${d.name}</i>${separator}`;
          }
          return `${d.name}${separator}`;
        }).join('')
      : 'None';

    const hardestLink = stats.hardestPosition 
      ? `<a href="/demonlist/${stats.hardestPosition}/">${stats.hardest}</a>`
      : `${stats.hardest}`;

    // Structure DOM native 100% calquée sur l'inspecteur Pointercrate (format wPopoff)
    flexCol.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <h3 id="player-name" style="font-size: 1.4em; overflow: hidden; margin: 0; display: flex; align-items: center; gap: 8px;">
          <span class="flag-icon" title="France" style="background-image: url(&quot;/static/demonlist/images/flags/fr.svg&quot;); width: 28px; height: 20px; display: inline-block;"></span>
          <span>${USER_NAME}</span>
        </h3>
      </div>

      <div class="stats-container flex space">
        <span>
          <b>Demonlist rank</b>
          <br>
          <span id="rank">${stats.rank}</span>
        </span>
        <span>
          <b>Demonlist score</b>
          <br>
          <span id="score">${stats.score.toFixed(2)}</span>
        </span>
      </div>

      <div class="stats-container flex space">
        <span>
          <b>Demonlist stats</b>
          <br>
          <span id="stats">${stats.mainCount} Main, ${stats.extendedCount} Extended, ${stats.legacyCount} Legacy</span>
        </span>
        <span>
          <b>Hardest demon</b>
          <br>
          <span id="hardest">${hardestLink}</span>
        </span>
      </div>

      <div class="stats-container flex space" style="display: block;">
        <span>
          <b>Demons completed</b>
          <br>
          <span id="beaten">${demonsListHtml}</span>
        </span>
      </div>

      <div class="stats-container flex space">
        <span>
          <b>Demons created</b>
          <br>
          <span id="created">None</span>
        </span>
        <span>
          <b>Demons published</b>
          <br>
          <span id="published">None</span>
        </span>
      </div>

      <div class="stats-container flex space" style="display: block;">
        <span>
          <b>Demons verified</b>
          <br>
          <span id="verified">None</span>
        </span>
      </div>

      <div class="stats-container flex space" style="display: block;">
        <span>
          <b>Progress on</b>
          <br>
          <span id="progress">None</span>
        </span>
      </div>
    `;
  }

  function runEnhancements() {
    highlightCompletedDemonsInDemonlist();
    setupStatsViewer();
  }

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runEnhancements, 80);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  loadStoredStats();
})();
