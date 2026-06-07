const WM_TIPPSPIEL_CARD_VERSION = "1.5.1";

const ALL_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const KNOCKOUT_ROUNDS = [
  "Sechzehntelfinale",
  "Achtelfinale",
  "Viertelfinale",
  "Halbfinale",
  "Spiel um Platz 3",
  "Finale",
];
const DEFAULT_ACCENT = "#fbbf24";
const DEFAULT_ACCENT_2 = "#22c55e";
const FLAG_CDN = "https://flagcdn.com/w40";

const TABS = [
  { id: "tips", label: "Vorrunde", icon: "mdi:soccer" },
  { id: "bracket", label: "KO-Runde", icon: "mdi:tournament", knockout: true },
  { id: "standings", label: "Rangliste", icon: "mdi:podium-gold" },
  { id: "players", label: "Spieler", icon: "mdi:account-group" },
];

/** ISO-3166 Codes für flagcdn.com (Emoji-Flaggen zeigen unter Windows oft MX/ZA statt 🇲🇽). */
const TEAM_ISO = {
  Mexiko: "mx",
  "Südafrika": "za",
  "Südkorea": "kr",
  Kanada: "ca",
  Katar: "qa",
  Schweiz: "ch",
  Brasilien: "br",
  Marokko: "ma",
  Haiti: "ht",
  Schottland: "gb-sct",
  USA: "us",
  Paraguay: "py",
  Australien: "au",
  Deutschland: "de",
  Curaçao: "cw",
  "Elfenbeinküste": "ci",
  Ecuador: "ec",
  Niederlande: "nl",
  Japan: "jp",
  Tunesien: "tn",
  Belgien: "be",
  Ägypten: "eg",
  Iran: "ir",
  Neuseeland: "nz",
  Spanien: "es",
  "Kap Verde": "cv",
  "Saudi-Arabien": "sa",
  Uruguay: "uy",
  "Bosnien und Herzegowina": "ba",
  Schweden: "se",
  Türkei: "tr",
  Tschechien: "cz",
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function teamFlag(name) {
  const iso = TEAM_ISO[name];
  const label = escapeHtml(name || "Team");
  if (!iso) {
    return `<span class="team-flag-fallback" title="${label}">🏳️</span>`;
  }
  const src = `${FLAG_CDN}/${iso}.png`;
  return `<img class="team-flag-img" src="${src}" alt="${label}" title="${label}" loading="lazy" />`;
}

function formatKickoff(iso) {
  if (!iso) return "–";
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isPastKickoff(iso, bufferMinutes = 5) {
  if (!iso) return false;
  return Date.now() >= new Date(iso).getTime() - bufferMinutes * 60 * 1000;
}

function normalizeGroups(groups) {
  if (!groups || !groups.length) return [...ALL_GROUPS];
  return groups.map((g) => String(g).toUpperCase());
}

function splitRoundMatches(list) {
  if (!list.length) return { left: [], right: [] };
  const mid = Math.ceil(list.length / 2);
  return { left: list.slice(0, mid), right: list.slice(mid) };
}

function isBracketPlaceholder(name) {
  if (!name) return true;
  return /^(?:\d+\. Gruppe|3\. Gruppe|Sieger|Verlierer)\s/.test(String(name));
}

function partitionMatches(matches) {
  const groups = new Map();
  const rounds = new Map();
  for (const g of ALL_GROUPS) groups.set(g, []);
  for (const r of KNOCKOUT_ROUNDS) rounds.set(r, []);

  for (const m of matches) {
    if (m.group) {
      const g = String(m.group).toUpperCase();
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(m);
    } else {
      const stage = m.stage || "K.o.-Runde";
      if (!rounds.has(stage)) rounds.set(stage, []);
      rounds.get(stage).push(m);
    }
  }
  return { groups, rounds };
}

function defaultConfig(overrides = {}) {
  return {
    type: "custom:wm-tippspiel-card",
    entity: "",
    title: "WM Tippspiel 2026",
    subtitle: "",
    player_id: "",
    admin: false,
    show_groups: [...ALL_GROUPS],
    show_knockout: true,
    show_rules: true,
    match_columns: "auto",
    auto_save_tips: true,
    accent_color: DEFAULT_ACCENT,
    ...overrides,
  };
}

/* ============================== Editor ============================== */

class WmTippspielCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = defaultConfig(config || {});
    this._newPlayerName = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._render();
  }

  _players() {
    const st = this._hass?.states?.[this._config.entity];
    return st?.attributes?.players || [];
  }

  _notify() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: { ...this._config } },
      })
    );
  }

  _set(key, value) {
    this._config = { ...this._config, [key]: value };
    this._notify();
    this._render();
  }

  _toggleGroup(group) {
    const set = new Set(normalizeGroups(this._config.show_groups));
    if (set.has(group)) set.delete(group);
    else set.add(group);
    this._set("show_groups", ALL_GROUPS.filter((g) => set.has(g)));
  }

  async _addPlayer() {
    const name = (this._newPlayerName || "").trim();
    if (!name || !this._hass) return;
    await this._hass.callService("wm_tippspiel", "add_player", { name });
    this._newPlayerName = "";
    this._render();
  }

  _editorSwitchValue(cfg, key) {
    switch (key) {
      case "admin":
        return Boolean(cfg.admin);
      case "show_knockout":
        return cfg.show_knockout !== false;
      case "show_rules":
        return cfg.show_rules !== false;
      case "auto_save_tips":
        return cfg.auto_save_tips !== false;
      default:
        return Boolean(cfg[key]);
    }
  }

  _bindEditorControls(cfg) {
    const picker = this.querySelector('ha-entity-picker[data-key="entity"]');
    if (picker) {
      picker.hass = this._hass;
      picker.value = cfg.entity || "";
      if (!picker.includeDomains) picker.includeDomains = ["sensor"];
      picker.addEventListener("value-changed", (ev) => {
        this._set("entity", ev.detail.value);
      });
    }

    this.querySelectorAll("ha-textfield[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      if (key === "new_player") {
        el.value = this._newPlayerName || "";
        el.addEventListener("input", (ev) => {
          this._newPlayerName = ev.target.value;
        });
        return;
      }
      el.value = cfg[key] ?? (key === "accent_color" ? DEFAULT_ACCENT : "");
      el.addEventListener("change", (ev) => {
        this._set(key, ev.target.value);
      });
    });

    this.querySelectorAll(".ed-chip[data-player]").forEach((chip) => {
      chip.addEventListener("click", () => {
        this._set("player_id", chip.getAttribute("data-player"));
      });
    });

    this.querySelector("[data-action=add-player]")?.addEventListener("click", () => this._addPlayer());

    this.querySelectorAll("[data-group]").forEach((cb) => {
      cb.addEventListener("change", () => {
        this._toggleGroup(cb.getAttribute("data-group"));
      });
    });

    this.querySelectorAll("ha-switch[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      el.checked = this._editorSwitchValue(cfg, key);
      el.addEventListener("change", () => {
        this._set(key, el.checked);
      });
    });

    const select = this.querySelector('ha-select[data-key="match_columns"]');
    if (select) {
      select.value = cfg.match_columns || "auto";
      const onSelect = (ev) => {
        const value = ev.detail?.value ?? select.value;
        if (value) this._set("match_columns", value);
      };
      select.addEventListener("selected", onSelect);
      select.addEventListener("value-changed", onSelect);
    }
  }

  _render() {
    const cfg = this._config;
    const players = this._players();

    this.innerHTML = `
      <div class="ed">
        <div class="ed-section">
          <div class="ed-title">Allgemein</div>
          <ha-entity-picker
            label="Ranglisten-Sensor"
            allow-custom-entity
            data-key="entity"
          ></ha-entity-picker>
          <ha-textfield
            label="Titel"
            data-key="title"
          ></ha-textfield>
          <ha-textfield
            label="Untertitel (optional)"
            data-key="subtitle"
          ></ha-textfield>
        </div>

        <div class="ed-section">
          <div class="ed-title">Spieler</div>
          <p class="ed-hint">Mitspieler werden in der Integration gespeichert und stehen auf allen Geräten zur Verfügung.</p>
          ${
            players.length
              ? `<div class="ed-chips">${players
                  .map(
                    (p) =>
                      `<span class="ed-chip ${p.id === cfg.player_id ? "active" : ""}" data-player="${escapeHtml(p.id)}" title="Als Standard-Tipper wählen">${escapeHtml(p.name)}</span>`
                  )
                  .join("")}</div>`
              : `<p class="ed-empty">Noch keine Spieler – unten einen Namen hinzufügen.</p>`
          }
          <div class="ed-add-row">
            <ha-textfield
              label="Neuer Spieler"
              data-key="new_player"
            ></ha-textfield>
            <mwc-button raised label="Hinzufügen" data-action="add-player"></mwc-button>
          </div>
        </div>

        <div class="ed-section">
          <div class="ed-title">Anzeige</div>
          <div class="ed-groups">
            ${ALL_GROUPS.map(
              (g) =>
                `<label class="ed-group-check">
                  <input type="checkbox" data-group="${g}" ${normalizeGroups(cfg.show_groups).includes(g) ? "checked" : ""} />
                  Gruppe ${g}
                </label>`
            ).join("")}
          </div>
          <ha-formfield label="KO-Runde anzeigen (Sechzehntelfinale bis Finale)">
            <ha-switch data-key="show_knockout"></ha-switch>
          </ha-formfield>
          <ha-formfield label="Tipps automatisch speichern">
            <ha-switch data-key="auto_save_tips"></ha-switch>
          </ha-formfield>
          <p class="ed-hint">Bei Auto-Save wird gespeichert, sobald beide Tore eingegeben sind (ca. 1 Sek. Pause). Sonst erscheint der Button „Tipp speichern“.</p>
          <ha-formfield label="Admin-Modus (Ergebnisse eintragen)">
            <ha-switch data-key="admin"></ha-switch>
          </ha-formfield>
          <ha-formfield label="Punkteregeln unten anzeigen">
            <ha-switch data-key="show_rules"></ha-switch>
          </ha-formfield>
          <p class="ed-hint">Dashboard-Breite: maximal 12 Spalten (= volle Viewbreite). Für maximale Breite eine <strong>Panel-Ansicht</strong> nutzen.</p>
          <ha-select
            label="Spiel-Layout (Spalten)"
            data-key="match_columns"
          >
            <mwc-list-item value="auto">Automatisch (mehr Spalten wenn breit genug)</mwc-list-item>
            <mwc-list-item value="1">Immer 1 Spalte</mwc-list-item>
            <mwc-list-item value="2">Immer 2 Spalten</mwc-list-item>
            <mwc-list-item value="3">Immer 3 Spalten</mwc-list-item>
          </ha-select>
        </div>

        <div class="ed-section">
          <div class="ed-title">Design</div>
          <ha-textfield
            label="Akzentfarbe (Hex)"
            data-key="accent_color"
          ></ha-textfield>
        </div>
      </div>
      <style>
        .ed { padding: 4px 0 20px; }
        .ed-section {
          margin-bottom: 20px;
          padding: 14px;
          border-radius: 12px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
        }
        .ed-title {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 10px;
          color: var(--primary-text-color);
        }
        .ed-hint, .ed-empty {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin: 0 0 10px;
          line-height: 1.45;
        }
        ha-entity-picker, ha-textfield, ha-formfield, ha-select {
          display: block;
          margin-bottom: 10px;
        }
        .ed-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .ed-chip {
          padding: 6px 12px;
          border-radius: 999px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          font-size: 13px;
          cursor: pointer;
        }
        .ed-chip.active {
          border-color: var(--primary-color);
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
          font-weight: 600;
        }
        .ed-add-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: end;
        }
        .ed-groups {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 12px;
        }
        .ed-group-check {
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
      </style>
    `;

    this._bindEditorControls(cfg);
  }
}

/* ============================== Main Card ============================== */

class WmTippspielCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("wm-tippspiel-card-editor");
  }

  static getStubConfig() {
    return defaultConfig();
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("Bitte in den Karten-Einstellungen den Ranglisten-Sensor wählen.");
    }
    this._config = defaultConfig(config);
    this._tab = this._tab || "tips";
    this._draftTips = this._draftTips || {};
    this._draftResults = this._draftResults || {};
    this._newPlayerName = this._newPlayerName || "";
    this._openAccordions = this._openAccordions || new Set();
    this._autoSaveTimers = this._autoSaveTimers || {};
    this._tipSaveStatus = this._tipSaveStatus || {};
    this._pendingRemovePlayerId = this._pendingRemovePlayerId || null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._bindEvents();
    }
    this._renderShell();
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    this.shadowRoot.addEventListener("click", (ev) => {
      const tabBtn = ev.target.closest("[data-tab]");
      if (tabBtn) {
        this._tab = tabBtn.getAttribute("data-tab");
        this._renderShell();
        return;
      }
      const removePlayer = ev.target.closest("[data-action=remove-player]");
      if (removePlayer) {
        ev.preventDefault();
        ev.stopPropagation();
        this._pendingRemovePlayerId = removePlayer.getAttribute("data-player-id");
        this._renderShell();
        return;
      }
      const confirmRemove = ev.target.closest("[data-action=confirm-remove-player]");
      if (confirmRemove) {
        ev.preventDefault();
        ev.stopPropagation();
        void this._removePlayer(confirmRemove.getAttribute("data-player-id"));
        return;
      }
      const cancelRemove = ev.target.closest("[data-action=cancel-remove-player]");
      if (cancelRemove) {
        ev.preventDefault();
        ev.stopPropagation();
        this._pendingRemovePlayerId = null;
        this._renderShell();
        return;
      }
      const selectRow = ev.target.closest("[data-action=select-player-row]");
      if (selectRow) {
        const nextId = selectRow.getAttribute("data-player-id");
        if (this._selectedPlayer && this._selectedPlayer !== nextId) {
          this._captureDraftInputsFromDom(this._selectedPlayer);
        }
        this._selectedPlayer = nextId;
        this._tab = "tips";
        this._renderShell();
        return;
      }
      const playerBtn = ev.target.closest(".player-chip[data-player-id]");
      if (playerBtn) {
        const nextId = playerBtn.getAttribute("data-player-id");
        if (this._selectedPlayer && this._selectedPlayer !== nextId) {
          this._captureDraftInputsFromDom(this._selectedPlayer);
        }
        this._selectedPlayer = nextId;
        this._renderShell();
        return;
      }
      const saveTip = ev.target.closest("[data-action=save-tip]");
      if (saveTip) {
        ev.preventDefault();
        this._saveTip(saveTip.getAttribute("data-match"), { btn: saveTip });
        return;
      }
      const saveResult = ev.target.closest("[data-action=save-result]");
      if (saveResult) {
        ev.preventDefault();
        this._saveResult(saveResult);
        return;
      }
      const clearResult = ev.target.closest("[data-action=clear-result]");
      if (clearResult) {
        ev.preventDefault();
        this._clearResult(clearResult);
        return;
      }
      const clearAllResults = ev.target.closest("[data-action=clear-all-results]");
      if (clearAllResults) {
        ev.preventDefault();
        this._clearAllResults(clearAllResults);
        return;
      }
      const addPlayer = ev.target.closest("[data-action=add-player-card]");
      if (addPlayer) {
        ev.preventDefault();
        this._addPlayerFromCard();
        return;
      }
    });

    this.shadowRoot.addEventListener("input", (ev) => {
      const addInput = ev.target.closest(".add-player-input");
      if (addInput) {
        this._newPlayerName = addInput.value;
        return;
      }
      const input = ev.target.closest(".score-input");
      if (!input) return;
      const matchId = input.getAttribute("data-match");
      const side = input.getAttribute("data-side");
      const kind = input.getAttribute("data-kind") || "tip";
      if (kind === "result") {
        this._draftResults[matchId] = this._draftResults[matchId] || {};
        this._draftResults[matchId][side] = input.value;
        return;
      }
      if (!this._selectedPlayer) return;
      const bucket = this._draftTipsForPlayer(this._selectedPlayer);
      bucket[matchId] = bucket[matchId] || {};
      bucket[matchId][side] = input.value;
      if (this._config.auto_save_tips !== false) {
        this._scheduleAutoSaveTip(matchId);
      } else {
        this._syncTipSaveButton(matchId);
      }
    });

    this.shadowRoot.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const tipInput = ev.target.closest('.score-input[data-kind="tip"]');
      if (tipInput && this._config.auto_save_tips === false) {
        const matchId = tipInput.getAttribute("data-match");
        if (matchId && this._tipInputsValid(matchId)) {
          ev.preventDefault();
          this._saveTip(matchId, { btn: this.shadowRoot.querySelector(`[data-action=save-tip][data-match="${matchId}"]`) });
        }
        return;
      }
      const addInput = ev.target.closest(".add-player-input");
      if (addInput) this._addPlayerFromCard();
    });

    this.shadowRoot.addEventListener(
      "toggle",
      (ev) => {
        const det = ev.target.closest("details.accordion");
        if (!det) return;
        const id = det.getAttribute("data-acc-id");
        if (!id) return;
        if (det.open) this._openAccordions.add(id);
        else this._openAccordions.delete(id);
      },
      true
    );
  }

  _draftTipsForPlayer(playerId) {
    if (!playerId) return {};
    if (!this._draftTips[playerId]) this._draftTips[playerId] = {};
    return this._draftTips[playerId];
  }

  _getDraftTip(playerId, matchId) {
    return this._draftTipsForPlayer(playerId)[matchId] || {};
  }

  _stateFingerprint(state) {
    if (!state) return "";
    const a = state.attributes || {};
    return JSON.stringify({
      players: a.players,
      standings: a.standings,
      matches: a.matches,
      tips: a.tips,
      results: a.results,
    });
  }

  _captureDraftInputsFromDom(forPlayerId = null) {
    const playerId = forPlayerId ?? this._selectedPlayer;
    if (!this.shadowRoot || !playerId) return;
    const playerDrafts = this._draftTipsForPlayer(playerId);
    this.shadowRoot.querySelectorAll('.score-input[data-kind="tip"]').forEach((inp) => {
      const matchId = inp.getAttribute("data-match");
      const side = inp.getAttribute("data-side");
      if (!matchId || !side) return;
      playerDrafts[matchId] = playerDrafts[matchId] || {};
      playerDrafts[matchId][side] = inp.value;
    });
    this.shadowRoot.querySelectorAll('.score-input[data-kind="result"]').forEach((inp) => {
      const matchId = inp.getAttribute("data-match");
      const side = inp.getAttribute("data-side");
      if (!matchId || !side) return;
      this._draftResults[matchId] = this._draftResults[matchId] || {};
      this._draftResults[matchId][side] = inp.value;
    });
  }

  _pruneDraftTips(validPlayerIds = null) {
    const ids =
      validPlayerIds ||
      new Set((this._state?.attributes?.players || []).map((p) => p.id));
    for (const pid of Object.keys(this._draftTips)) {
      if (!ids.has(pid)) delete this._draftTips[pid];
    }
  }

  _filterTipsForPlayers(tips, players) {
    const validIds = new Set((players || []).map((p) => p.id));
    const filtered = {};
    for (const [pid, playerTips] of Object.entries(tips || {})) {
      if (validIds.has(pid)) filtered[pid] = playerTips;
    }
    return filtered;
  }

  _applySavedTip(matchId, home, away) {
    if (!this._state?.attributes || !this._selectedPlayer) return;
    const attrs = this._state.attributes;
    const tips = { ...(attrs.tips || {}) };
    tips[this._selectedPlayer] = { ...(tips[this._selectedPlayer] || {}), [matchId]: { home, away } };
    this._state = { ...this._state, attributes: { ...attrs, tips } };
    this._stateFingerprintCache = this._stateFingerprint(this._state);
  }

  _applySavedResult(matchId, home, away) {
    if (!this._state?.attributes) return;
    const attrs = this._state.attributes;
    const results = { ...(attrs.results || {}), [matchId]: { home, away } };
    this._state = { ...this._state, attributes: { ...attrs, results } };
    this._stateFingerprintCache = this._stateFingerprint(this._state);
  }

  _applyClearedResult(matchId) {
    if (!this._state?.attributes) return;
    const attrs = this._state.attributes;
    const results = { ...(attrs.results || {}) };
    delete results[matchId];
    this._state = { ...this._state, attributes: { ...attrs, results } };
    this._stateFingerprintCache = this._stateFingerprint(this._state);
  }

  _applyClearedAllResults() {
    if (!this._state?.attributes) return;
    const attrs = this._state.attributes;
    this._state = { ...this._state, attributes: { ...attrs, results: {} } };
    this._stateFingerprintCache = this._stateFingerprint(this._state);
  }

  _renderAdminResultControls(m, results) {
    if (!this._isAdmin()) return "";
    const res = results[m.id];
    const draft = this._draftResults[m.id] || {};
    const homeVal = draft.home ?? res?.home ?? "";
    const awayVal = draft.away ?? res?.away ?? "";
    let html = `<div class="admin-row">
      <span class="admin-label">${res ? "Ergebnis bearbeiten" : "Ergebnis eintragen"} <span class="match-id">(${m.id})</span></span>
      <input class="score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="home" data-kind="result" value="${homeVal}" placeholder="0" />
      <span class="sep">:</span>
      <input class="score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="away" data-kind="result" value="${awayVal}" placeholder="0" />
      <button type="button" class="btn btn-secondary" data-action="save-result" data-match="${m.id}">Speichern</button>`;
    if (res) {
      html += `<button type="button" class="btn btn-danger" data-action="clear-result" data-match="${m.id}">Ergebnis löschen</button>`;
    }
    html += `</div>`;
    return html;
  }

  _tipInputsValid(matchId) {
    const homeIn = this.shadowRoot?.querySelector(
      `.score-input[data-match="${matchId}"][data-side="home"][data-kind="tip"]`
    );
    const awayIn = this.shadowRoot?.querySelector(
      `.score-input[data-match="${matchId}"][data-side="away"][data-kind="tip"]`
    );
    if (homeIn && awayIn) {
      return homeIn.value !== "" && awayIn.value !== "" && !Number.isNaN(Number(homeIn.value)) && !Number.isNaN(Number(awayIn.value));
    }
    const draft = this._getDraftTip(this._selectedPlayer, matchId);
    return draft.home !== "" && draft.home != null && draft.away !== "" && draft.away != null;
  }

  _syncTipSaveButton(matchId) {
    const btn = this.shadowRoot?.querySelector(`[data-action=save-tip][data-match="${matchId}"]`);
    if (btn) btn.disabled = !this._tipInputsValid(matchId);
  }

  _autoSaveEnabled() {
    return this._config.auto_save_tips !== false;
  }

  _getSavedTip(matchId) {
    return this._state?.attributes?.tips?.[this._selectedPlayer]?.[matchId] || null;
  }

  _scheduleAutoSaveTip(matchId) {
    if (!this._autoSaveEnabled() || !this._selectedPlayer) return;
    clearTimeout(this._autoSaveTimers[matchId]);
    this._autoSaveTimers[matchId] = setTimeout(() => {
      delete this._autoSaveTimers[matchId];
      if (this._tipInputsValid(matchId)) this._saveTip(matchId, { silent: true });
    }, 900);
    this._setTipSaveStatus(matchId, "pending");
  }

  _setTipSaveStatus(matchId, status) {
    this._tipSaveStatus[matchId] = status;
    const el = this.shadowRoot?.querySelector(`.tip-status[data-match="${matchId}"]`);
    if (!el) return;
    el.className = `badge tip-status tip-status-${status}`;
    if (status === "pending") el.textContent = "…";
    else if (status === "saving") el.textContent = "Speichern…";
    else if (status === "saved") el.textContent = "Gespeichert ✓";
    else if (status === "error") el.textContent = "Fehler";
    else el.textContent = "";
    if (status === "saved") {
      clearTimeout(this._tipSaveStatusTimers?.[matchId]);
      this._tipSaveStatusTimers = this._tipSaveStatusTimers || {};
      this._tipSaveStatusTimers[matchId] = setTimeout(() => {
        delete this._tipSaveStatus[matchId];
        if (el.isConnected) {
          el.className = "badge tip-status";
          el.textContent = "";
        }
      }, 2200);
    }
  }

  _showToast(message, type = "info") {
    const root = this.shadowRoot;
    if (!root) return;
    let toast = root.querySelector(".wm-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "wm-toast";
      root.querySelector(".card-wrap")?.appendChild(toast);
    }
    toast.className = `wm-toast ${type}`;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass.states[this._config.entity];
    if (!state) {
      if (this._state !== null) {
        this._state = null;
        this._stateFingerprintCache = "";
        this._renderShell();
      }
      return;
    }
    const fp = this._stateFingerprint(state);
    const changed = fp !== this._stateFingerprintCache;
    this._stateFingerprintCache = fp;
    this._state = state;
    this._ensurePlayer();
    this._pruneDraftTips();
    if (changed || !this._shellReady) {
      this._renderShell();
      this._shellReady = true;
    }
  }

  getCardSize() {
    return 8;
  }

  _ensurePlayer() {
    const players = this._state?.attributes?.players || [];
    if (!players.length) {
      this._selectedPlayer = null;
      return;
    }
    if (this._selectedPlayer && players.some((p) => p.id === this._selectedPlayer)) {
      return;
    }
    if (this._config.player_id && players.some((p) => p.id === this._config.player_id)) {
      this._selectedPlayer = this._config.player_id;
      return;
    }
    this._selectedPlayer = players[0].id;
  }

  _data() {
    const a = this._state?.attributes || {};
    const players = a.players || [];
    return {
      standings: a.standings || [],
      players,
      matches: a.matches || [],
      tips: this._filterTipsForPlayers(a.tips || {}, players),
      results: a.results || {},
    };
  }

  _filteredMatches(matches) {
    const set = new Set(normalizeGroups(this._config.show_groups));
    const showKnockout = this._config.show_knockout !== false;
    return matches.filter((m) => {
      if (m.group) return set.has(String(m.group).toUpperCase());
      return showKnockout;
    });
  }

  _groupStageMatches(matches) {
    return this._filteredMatches(matches).filter((m) => m.group);
  }

  _knockoutMatches(matches) {
    return this._filteredMatches(matches).filter((m) => !m.group);
  }

  _visibleTabs() {
    const showKnockout = this._config.show_knockout !== false;
    return TABS.filter((t) => !t.knockout || showKnockout);
  }

  _defaultOpenAccordionId() {
    const groups = normalizeGroups(this._config.show_groups);
    const preferred = groups.includes("E") ? "E" : groups[0];
    return preferred ? `group-${preferred}` : null;
  }

  _isAccordionOpen(id) {
    if (this._openAccordions.has(id)) return true;
    if (this._openAccordions.size === 0 && id === this._defaultOpenAccordionId()) return true;
    return false;
  }

  _renderAccordion(id, title, count, bodyHtml) {
    const open = this._isAccordionOpen(id);
    return `<details class="accordion" data-acc-id="${escapeHtml(id)}"${open ? " open" : ""}>
      <summary>
        <span class="acc-title">${escapeHtml(title)}</span>
        <span class="acc-count">${count} Spiele</span>
      </summary>
      <div class="accordion-body">${bodyHtml}</div>
    </details>`;
  }

  _renderMatchAccordions(matches, renderMatchFn) {
    const { groups, rounds } = partitionMatches(matches);
    let html = "";

    for (const g of ALL_GROUPS) {
      const list = groups.get(g) || [];
      if (!list.length) continue;
      html += this._renderAccordion(
        `group-${g}`,
        `Gruppe ${g}`,
        list.length,
        list.map(renderMatchFn).join("")
      );
    }

    for (const stage of KNOCKOUT_ROUNDS) {
      const list = rounds.get(stage) || [];
      if (!list.length) continue;
      html += this._renderAccordion(
        `round-${stage}`,
        stage,
        list.length,
        list.map(renderMatchFn).join("")
      );
    }

    for (const [stage, list] of rounds.entries()) {
      if (KNOCKOUT_ROUNDS.includes(stage) || !list.length) continue;
      html += this._renderAccordion(
        `round-${stage}`,
        stage,
        list.length,
        list.map(renderMatchFn).join("")
      );
    }

    return html;
  }

  _matchColumns() {
    const mode = this._config.match_columns || "auto";
    return ["1", "2", "3"].includes(mode) ? mode : "auto";
  }

  _accent() {
    return this._config.accent_color || DEFAULT_ACCENT;
  }

  _entryId() {
    const entryId = this._state?.attributes?.entry_id;
    if (entryId) return entryId;
    const entityId = this._config?.entity;
    const uniqueId = this._hass?.entities?.[entityId]?.unique_id || "";
    if (uniqueId.endsWith("_leaderboard")) {
      return uniqueId.slice(0, -"_leaderboard".length);
    }
    return null;
  }

  async _callService(service, data = {}) {
    const payload = { ...data };
    const entryId = this._entryId();
    if (entryId && payload.entry_id == null) payload.entry_id = entryId;
    await this._hass.callService("wm_tippspiel", service, payload);
  }

  _styles() {
    const accent = this._accent();
    return `
      :host { display: block; width: 100%; }
      * { box-sizing: border-box; }
      ha-card {
        overflow: hidden;
        width: 100%;
        max-width: none;
        border-radius: 20px;
        border: none;
        background: var(--ha-card-background, var(--card-background-color, #1a1d24));
        box-shadow: 0 8px 32px rgba(0,0,0,0.22);
      }
      .card-wrap { position: relative; }
      .hero {
        position: relative;
        padding: 20px 20px 18px;
        background: linear-gradient(135deg, ${accent}33 0%, ${DEFAULT_ACCENT_2}22 45%, transparent 100%);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        overflow: hidden;
      }
      .hero::after {
        content: "⚽";
        position: absolute;
        right: -8px;
        top: -16px;
        font-size: 96px;
        opacity: 0.07;
        transform: rotate(18deg);
        pointer-events: none;
      }
      .hero-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .hero-text h1 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1.2;
      }
      .hero-text p {
        margin: 4px 0 0;
        font-size: 0.82rem;
        opacity: 0.72;
      }
      .badge-admin {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(248,113,113,0.2);
        color: #fca5a5;
        border: 1px solid rgba(248,113,113,0.35);
        white-space: nowrap;
      }
      .player-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .player-chip {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.18);
        color: inherit;
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s, border-color 0.15s, background 0.15s;
      }
      .player-chip:hover { transform: translateY(-1px); }
      .player-chip.active {
        border-color: ${accent};
        background: ${accent}28;
        color: ${accent};
        box-shadow: 0 0 0 1px ${accent}44;
      }
      .tabs {
        display: flex;
        gap: 8px;
        padding: 14px 16px 0;
      }
      .tab {
        flex: 1;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.03);
        color: inherit;
        border-radius: 12px;
        padding: 10px 8px;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        opacity: 0.75;
        transition: all 0.15s;
      }
      .tab ha-icon { --mdc-icon-size: 20px; opacity: 0.9; }
      .tab.active {
        opacity: 1;
        border-color: ${accent}88;
        background: ${accent}18;
        color: ${accent};
      }
      .body {
        padding: 14px 16px 16px;
        container-type: inline-size;
        container-name: wm-body;
      }
      .body[data-match-cols="2"] .accordion-body,
      .body[data-match-cols="3"] .accordion-body {
        display: grid;
        gap: 12px;
      }
      .body[data-match-cols="2"] .accordion-body {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .body[data-match-cols="3"] .accordion-body {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .body[data-match-cols="2"] .accordion-body .match,
      .body[data-match-cols="3"] .accordion-body .match {
        margin-bottom: 0;
      }
      @container wm-body (min-width: 720px) {
        .body[data-match-cols="auto"] .accordion-body {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .body[data-match-cols="auto"] .accordion-body .match {
          margin-bottom: 0;
        }
      }
      @container wm-body (min-width: 1100px) {
        .body[data-match-cols="auto"] .accordion-body {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      .match {
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 16px;
        padding: 14px;
        margin-bottom: 12px;
        background: rgba(0,0,0,0.12);
        backdrop-filter: blur(6px);
      }
      .match-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.72rem;
        opacity: 0.65;
        margin-bottom: 12px;
      }
      .teams {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 10px;
      }
      .team {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .team.away { align-items: flex-end; text-align: right; }
      .team-flag {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
      }
      .team-flag-img {
        width: 32px;
        height: 22px;
        object-fit: cover;
        border-radius: 3px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.12);
      }
      .team.away .team-flag-img { margin-left: auto; }
      .team-flag-fallback { font-size: 1.5rem; line-height: 1; }
      .team-name {
        font-weight: 700;
        font-size: 0.88rem;
        line-height: 1.25;
        word-break: break-word;
      }
      .score-box {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 14px;
        background: rgba(0,0,0,0.22);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .score-input {
        width: 38px;
        height: 38px;
        text-align: center;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.15);
        background: rgba(255,255,255,0.06);
        color: inherit;
        font-size: 1.1rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }
      .score-input:focus {
        outline: 2px solid ${accent}88;
        border-color: ${accent};
      }
      .score-input:disabled { opacity: 0.4; }
      .score-static {
        min-width: 24px;
        text-align: center;
        font-size: 1.25rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }
      .sep { opacity: 0.45; font-weight: 800; }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 10px;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 999px;
      }
      .badge-result { background: rgba(34,197,94,0.15); color: #86efac; }
      .badge-locked { background: rgba(148,163,184,0.12); color: #cbd5e1; }
      .badge-points { background: ${accent}22; color: ${accent}; }
      .tip-status {
        min-width: 88px;
        text-align: center;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .tip-status-pending,
      .tip-status-saving,
      .tip-status-saved,
      .tip-status-error {
        opacity: 1;
      }
      .tip-status-pending { color: #94a3b8; border-color: rgba(148,163,184,0.25); }
      .tip-status-saving { color: ${accent}; border-color: ${accent}55; }
      .tip-status-saved { color: #86efac; border-color: rgba(134,239,172,0.35); background: rgba(34,197,94,0.12); }
      .tip-status-error { color: #fca5a5; border-color: rgba(248,113,113,0.35); }
      .btn {
        margin-top: 10px;
        width: 100%;
        border: none;
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: 700;
        font-size: 0.82rem;
        cursor: pointer;
        background: linear-gradient(135deg, ${accent}, ${DEFAULT_ACCENT_2});
        color: #111;
        transition: opacity 0.15s, transform 0.15s;
      }
      .btn:hover { transform: translateY(-1px); }
      .btn:disabled { opacity: 0.45; cursor: default; transform: none; }
      .wm-toast {
        position: absolute;
        left: 50%;
        bottom: 52px;
        transform: translateX(-50%) translateY(8px);
        padding: 10px 16px;
        border-radius: 12px;
        font-size: 0.82rem;
        font-weight: 600;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s, transform 0.2s;
        z-index: 10;
        white-space: nowrap;
        background: rgba(0,0,0,0.85);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.12);
      }
      .wm-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
      .wm-toast.success { border-color: rgba(34,197,94,0.5); color: #86efac; }
      .wm-toast.error { border-color: rgba(248,113,113,0.5); color: #fca5a5; }
      .btn-secondary {
        background: rgba(255,255,255,0.08);
        color: inherit;
        border: 1px solid rgba(255,255,255,0.12);
      }
      .btn-danger {
        background: rgba(239,68,68,0.15);
        color: #fca5a5;
        border: 1px solid rgba(239,68,68,0.35);
      }
      .admin-row {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .admin-label {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        opacity: 0.55;
        letter-spacing: 0.05em;
        width: 100%;
      }
      .match-id {
        text-transform: none;
        letter-spacing: 0;
        font-weight: 600;
        opacity: 0.85;
      }
      .results-admin-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 0.82rem;
      }
      .group-label {
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.5;
        margin: 16px 0 8px;
        padding-left: 4px;
      }
      .group-label:first-child { margin-top: 0; }
      .accordion {
        margin-bottom: 8px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
        overflow: hidden;
      }
      .accordion > summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        font-weight: 700;
        font-size: 0.88rem;
        user-select: none;
      }
      .accordion > summary::-webkit-details-marker { display: none; }
      .accordion > summary::after {
        content: "▸";
        opacity: 0.45;
        font-size: 0.85rem;
        transition: transform 0.15s ease;
      }
      .accordion[open] > summary::after {
        transform: rotate(90deg);
      }
      .acc-title { flex: 1; }
      .acc-count {
        font-size: 0.72rem;
        font-weight: 600;
        opacity: 0.45;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .accordion-body {
        padding: 0 10px 10px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .podium {
        display: grid;
        grid-template-columns: 1fr 1.15fr 1fr;
        gap: 8px;
        align-items: end;
        margin-bottom: 18px;
        min-height: 130px;
      }
      .podium-item {
        text-align: center;
        border-radius: 14px 14px 0 0;
        padding: 10px 6px 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .podium-item.first {
        order: 2;
        min-height: 118px;
        background: linear-gradient(180deg, ${accent}33, rgba(255,255,255,0.03));
        border-color: ${accent}55;
      }
      .podium-item.second { order: 1; min-height: 92px; }
      .podium-item.third { order: 3; min-height: 82px; }
      .podium-rank { font-size: 1.4rem; }
      .podium-name {
        font-weight: 700;
        font-size: 0.82rem;
        margin: 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .podium-pts {
        font-size: 1.1rem;
        font-weight: 800;
        color: ${accent};
      }
      .standing-row {
        display: grid;
        grid-template-columns: 32px 1fr repeat(3, 44px);
        gap: 8px;
        align-items: center;
        padding: 10px 4px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-size: 0.86rem;
      }
      .standing-row.head {
        font-size: 0.68rem;
        opacity: 0.55;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding-top: 0;
      }
      .rank-num {
        width: 26px; height: 26px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 800; font-size: 0.78rem;
        background: rgba(255,255,255,0.08);
      }
      .num { text-align: center; font-variant-numeric: tabular-nums; font-weight: 600; }
      .bracket-scroll {
        overflow-x: auto;
        padding-bottom: 8px;
        margin: 0 -4px;
      }
      .bracket-tree {
        display: grid;
        grid-template-columns: 1fr minmax(160px, 220px) 1fr;
        gap: 12px;
        min-width: min(100%, 920px);
        align-items: stretch;
      }
      .bracket-side {
        display: flex;
        gap: 10px;
        min-width: 0;
      }
      .bracket-side.left { justify-content: flex-end; }
      .bracket-side.right { justify-content: flex-start; }
      .bracket-center {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 12px;
      }
      .bracket-round {
        flex: 1;
        min-width: 148px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bracket-round-title {
        font-size: 0.62rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.55;
        text-align: center;
        margin-bottom: 2px;
        line-height: 1.2;
      }
      .bracket-round-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        gap: 8px;
      }
      .bracket-slot {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 140px;
      }
      .bracket-slot-head {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        font-size: 0.62rem;
        opacity: 0.55;
      }
      .bracket-id { font-weight: 700; }
      .bracket-team-line {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        background: rgba(255,255,255,0.05);
        border-radius: 999px;
        padding: 4px 8px;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .bracket-label {
        flex: 1;
        font-size: 0.72rem;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bracket-score-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .bracket-input {
        width: 42px;
        min-height: 34px;
        text-align: center;
        font-size: 0.95rem;
        font-weight: 700;
      }
      .bracket-score {
        min-width: 20px;
        text-align: center;
        font-weight: 700;
      }
      .bracket-slot-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
      }
      .bracket-slot-footer .badge { font-size: 0.62rem; }
      .bracket-slot-footer .btn { font-size: 0.68rem; padding: 4px 8px; }
      .bracket-slot.center-final {
        border-color: ${accent}66;
        background: linear-gradient(180deg, ${accent}22, rgba(255,255,255,0.03));
      }
      .bracket-mobile {
        display: none;
      }
      @media (max-width: 860px) {
        .bracket-tree { display: none; }
        .bracket-mobile {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .bracket-mobile-round {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      }
      .empty {
        text-align: center;
        padding: 28px 16px;
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px dashed rgba(255,255,255,0.12);
      }
      .empty-icon { font-size: 2.2rem; margin-bottom: 8px; }
      .empty h3 { margin: 0 0 6px; font-size: 1rem; }
      .empty p { margin: 0; font-size: 0.82rem; opacity: 0.7; line-height: 1.45; }
      .rules {
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: 0.72rem;
        opacity: 0.65;
        line-height: 1.45;
        background: rgba(255,255,255,0.03);
        text-align: center;
      }
      .missing {
        padding: 24px;
        text-align: center;
        color: var(--secondary-text-color, #aaa);
      }
      .version-badge {
        position: absolute;
        right: 12px;
        bottom: 8px;
        font-size: 0.62rem;
        opacity: 0.45;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .player-panel {
        border-radius: 16px;
        padding: 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .player-panel h3 {
        margin: 0 0 6px;
        font-size: 1rem;
      }
      .player-panel p {
        margin: 0 0 14px;
        font-size: 0.82rem;
        opacity: 0.72;
        line-height: 1.45;
      }
      .player-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 14px;
      }
      .player-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .player-row-name { font-weight: 700; font-size: 0.92rem; }
      .player-row-id { font-size: 0.68rem; opacity: 0.5; }
      .player-row-confirm {
        border-color: rgba(248,113,113,0.35);
        background: rgba(248,113,113,0.08);
      }
      .player-row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .btn-icon {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: inherit;
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 0.75rem;
        cursor: pointer;
      }
      .btn-icon.danger { color: #fca5a5; border-color: rgba(248,113,113,0.35); }
      .add-player-box {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .add-player-input {
        width: 100%;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.15);
        background: rgba(0,0,0,0.22);
        color: inherit;
        padding: 12px 14px;
        font-size: 0.92rem;
      }
      .add-player-input:focus {
        outline: 2px solid ${accent}88;
        border-color: ${accent};
      }
    `;
  }

  _renderShell() {
    if (!this.shadowRoot) return;
    if (this._tab === "matches") this._tab = "bracket";
    if ((this._tab === "tips" || this._tab === "bracket") && this._selectedPlayer) {
      const active = this.shadowRoot.activeElement;
      if (active?.classList?.contains("score-input") && active.getAttribute("data-kind") === "tip") {
        this._captureDraftInputsFromDom(this._selectedPlayer);
      }
    }
    const cfg = this._config;
    const missing = !this._hass?.states?.[cfg.entity];

    let body = "";
    if (missing) {
      body = `<div class="missing">
        <div class="empty-icon">⚠️</div>
        <strong>Sensor nicht gefunden</strong><br/>
        <span style="font-size:0.85rem;opacity:0.8">${escapeHtml(cfg.entity)}</span><br/><br/>
        <span style="font-size:0.82rem">Integration einrichten und Sensor in den Karten-Einstellungen wählen.</span>
      </div>`;
    } else {
      const { players, matches, standings, tips, results } = this._data();
      const groupMatches = this._groupStageMatches(matches);
      const knockoutMatches = this._knockoutMatches(matches);
      const playerId = this._selectedPlayer;
      const playerTips = tips[playerId] || {};

      if (!players.length && (this._tab === "tips" || this._tab === "bracket")) this._tab = "players";
      if (this._tab === "bracket" && this._config.show_knockout === false) this._tab = "tips";

      if (this._tab === "standings") body = this._renderStandings(standings);
      else if (this._tab === "bracket") body = this._renderBracket(knockoutMatches, playerTips, results, playerId, players);
      else if (this._tab === "players") body = this._renderPlayers(players);
      else body = this._renderTips(groupMatches, playerTips, results, playerId, players);
    }

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-wrap">
          <div class="hero">
            <div class="hero-top">
              <div class="hero-text">
                <h1>${escapeHtml(cfg.title || "WM Tippspiel")}</h1>
                ${cfg.subtitle ? `<p>${escapeHtml(cfg.subtitle)}</p>` : `<p>Fußball-WM 2026 · Tipprunde</p>`}
              </div>
              ${this._isAdmin() ? `<span class="badge-admin">Admin</span>` : ""}
            </div>
            ${
              !missing && (this._data().players || []).length
                ? `<div class="player-bar">${this._data()
                    .players.map(
                      (p) =>
                        `<button type="button" class="player-chip ${p.id === this._selectedPlayer ? "active" : ""}" data-player-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`
                    )
                    .join("")}</div>`
                : ""
            }
          </div>
          <div class="tabs">
            ${this._visibleTabs()
              .map(
                (t) =>
                  `<button type="button" class="tab ${this._tab === t.id ? "active" : ""}" data-tab="${t.id}">
                  <ha-icon icon="${t.icon}"></ha-icon>
                  <span>${t.label}</span>
                </button>`
              )
              .join("")}
          </div>
          <div class="body" data-match-cols="${this._matchColumns()}">${body}</div>
          ${cfg.show_rules !== false ? `<div class="rules">⚽ 3 Punkte exakt · 1 Punkt richtige Tendenz</div>` : ""}
          <div class="version-badge">v${WM_TIPPSPIEL_CARD_VERSION}</div>
        </div>
      </ha-card>
    `;

    if (this._tab === "tips" || this._tab === "bracket") {
      this.shadowRoot.querySelectorAll("[data-action=save-tip]").forEach((btn) => {
        this._syncTipSaveButton(btn.getAttribute("data-match"));
      });
    }
  }

  _renderPlayers(players) {
    const pendingId = this._pendingRemovePlayerId;
    const list =
      players.length > 0
        ? `<div class="player-list">${players
            .map((p) => {
              if (pendingId === p.id) {
                return `<div class="player-row player-row-confirm">
                  <div>
                    <div class="player-row-name">${escapeHtml(p.name)} wirklich entfernen?</div>
                    <div class="player-row-id">Alle Tipps dieses Spielers werden gelöscht.</div>
                  </div>
                  <div class="player-row-actions">
                    <button type="button" class="btn-icon danger" data-action="confirm-remove-player" data-player-id="${escapeHtml(p.id)}">Ja, löschen</button>
                    <button type="button" class="btn-icon" data-action="cancel-remove-player">Abbrechen</button>
                  </div>
                </div>`;
              }
              return `<div class="player-row">
                  <div>
                    <div class="player-row-name">${escapeHtml(p.name)}</div>
                    <div class="player-row-id">ID: ${escapeHtml(p.id)}</div>
                  </div>
                  <div class="player-row-actions">
                    <button type="button" class="btn-icon" data-action="select-player-row" data-player-id="${escapeHtml(p.id)}">Tippen</button>
                    ${this._isAdmin() ? `<button type="button" class="btn-icon danger" data-action="remove-player" data-player-id="${escapeHtml(p.id)}">Entfernen</button>` : ""}
                  </div>
                </div>`;
            })
            .join("")}</div>`
        : `<div class="empty" style="margin-bottom:14px">
            <div class="empty-icon">👥</div>
            <h3>Noch keine Spieler</h3>
            <p>Füge unten die ersten Mitspieler hinzu – z. B. deinen Namen.</p>
          </div>`;

    return `<div class="player-panel">
      <h3>Mitspieler verwalten</h3>
      <p>Spieler werden für das gesamte Tippspiel gespeichert und stehen auf allen Geräten zur Verfügung.</p>
      ${list}
      <div class="add-player-box">
        <input class="add-player-input" type="text" placeholder="Name eingeben…" value="${escapeHtml(this._newPlayerName || "")}" />
        <button type="button" class="btn" data-action="add-player-card" style="margin-top:0;width:auto;padding:12px 16px">+ Hinzufügen</button>
      </div>
    </div>`;
  }

  async _addPlayerFromCard() {
    const name = (this._newPlayerName || "").trim();
    if (!name || !this._hass) return;
    await this._callService("add_player", { name });
    this._newPlayerName = "";
    this._tab = "tips";
  }

  _isAdmin() {
    return this._config.admin === true || this._config.admin === "true";
  }

  async _removePlayer(playerId) {
    if (!playerId || !this._hass) return;
    if (!this._isAdmin()) {
      this._showToast("Spieler entfernen ist nur im Admin-Modus möglich.", "error");
      return;
    }

    const players = this._data().players || [];
    const player = players.find((p) => p.id === playerId);
    const name = player?.name || "Spieler";

    try {
      await this._callService("remove_player", { player_id: playerId });
      this._pendingRemovePlayerId = null;
      delete this._draftTips[playerId];
      if (this._selectedPlayer === playerId) this._selectedPlayer = null;
      if (this._state?.attributes) {
        const attrs = { ...this._state.attributes };
        attrs.players = (attrs.players || []).filter((p) => p.id !== playerId);
        attrs.tips = this._filterTipsForPlayers(attrs.tips || {}, attrs.players);
        attrs.standings = (attrs.standings || []).filter((s) => s.id !== playerId);
        this._state = { ...this._state, attributes: attrs };
        this._stateFingerprintCache = this._stateFingerprint(this._state);
      }
      this._pruneDraftTips();
      this._ensurePlayer();
      this._renderShell();
      this._showToast(`${name} entfernt`, "success");
    } catch (err) {
      console.error("[wm-tippspiel-card] remove_player failed:", err);
      this._showToast(`Entfernen fehlgeschlagen: ${err?.message || err}`, "error");
    }
  }

  _renderStandings(standings) {
    if (!standings.length) {
      return `<div class="empty">
        <div class="empty-icon">🏆</div>
        <h3>Noch keine Rangliste</h3>
        <p>Sobald Ergebnisse eingetragen sind, erscheinen hier die Punkte.</p>
      </div>`;
    }

    const top3 = standings.slice(0, 3);
    const podiumSlots = [
      { player: top3[1], cls: "second", medal: "🥈" },
      { player: top3[0], cls: "first", medal: "🥇" },
      { player: top3[2], cls: "third", medal: "🥉" },
    ].filter((slot) => slot.player);
    const podium = podiumSlots.length
      ? `<div class="podium">${podiumSlots
          .map(({ player: s, cls, medal }) => {
            return `<div class="podium-item ${cls}">
              <div class="podium-rank">${medal}</div>
              <div class="podium-name">${escapeHtml(s.name)}</div>
              <div class="podium-pts">${s.points} Pkt.</div>
            </div>`;
          })
          .join("")}</div>`
      : "";

    const rows = standings
      .map((s, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : s.rank;
        return `<div class="standing-row">
          <div class="rank-num">${medal}</div>
          <div>${escapeHtml(s.name)}</div>
          <div class="num">${s.points}</div>
          <div class="num">${s.exact}</div>
          <div class="num">${s.tendency}</div>
        </div>`;
      })
      .join("");

    return `${podium}
      <div class="standing-row head">
        <div>#</div><div>Spieler</div><div class="num">Pkt</div><div class="num">Exakt</div><div class="num">Tendenz</div>
      </div>${rows}`;
  }

  _renderMatchTeams(m, scoreHtml, extra = "") {
    return `<div class="match">
      <div class="match-meta">
        <span>${formatKickoff(m.kickoff)}</span>
        <span>${escapeHtml(m.venue || m.stage || "")}</span>
      </div>
      <div class="teams">
        <div class="team">
          <span class="team-flag">${teamFlag(m.home)}</span>
          <span class="team-name">${escapeHtml(m.home)}</span>
        </div>
        <div class="score-box">${scoreHtml}</div>
        <div class="team away">
          <span class="team-flag">${teamFlag(m.away)}</span>
          <span class="team-name">${escapeHtml(m.away)}</span>
        </div>
      </div>
      ${extra}
    </div>`;
  }

  _renderBracketMatchSlot(m, playerTips, results, playerId, options = {}) {
    const locked = isPastKickoff(m.kickoff) && !this._isAdmin();
    const savedTip = playerTips[m.id] || {};
    const draftTip = this._getDraftTip(playerId, m.id);
    const tip = { ...savedTip, ...draftTip };
    const res = results[m.id];
    const homeVal = tip.home ?? "";
    const awayVal = tip.away ?? "";
    const pts = this._tipPoints(tip.home != null && tip.away != null ? tip : null, res);
    const centerClass = options.center ? " center-final" : "";

    const homeScore = locked
      ? `<span class="bracket-score">${homeVal !== "" ? homeVal : "–"}</span>`
      : `<input class="score-input bracket-input" type="number" min="0" max="20" inputmode="numeric" data-match="${m.id}" data-side="home" data-kind="tip" value="${homeVal}" aria-label="Tore Heim" />`;
    const awayScore = locked
      ? `<span class="bracket-score">${awayVal !== "" ? awayVal : "–"}</span>`
      : `<input class="score-input bracket-input" type="number" min="0" max="20" inputmode="numeric" data-match="${m.id}" data-side="away" data-kind="tip" value="${awayVal}" aria-label="Tore Auswärts" />`;

    let footer = "";
    if (res) footer += `<span class="badge badge-result">${res.home}:${res.away}</span>`;
    if (pts != null && tip.home !== "" && tip.away !== "") {
      footer += `<span class="badge badge-points">+${pts}</span>`;
    }
    if (!locked) {
      if (this._autoSaveEnabled()) {
        const status = this._tipSaveStatus[m.id] || "";
        if (status) {
          footer += `<span class="badge tip-status tip-status-${status}" data-match="${m.id}">${
            status === "pending"
              ? "…"
              : status === "saving"
                ? "Speichern…"
                : status === "saved"
                  ? "✓"
                  : status === "error"
                    ? "!"
                    : ""
          }</span>`;
        }
      } else {
        const canSave = this._tipInputsValid(m.id) || (homeVal !== "" && awayVal !== "");
        footer += `<button type="button" class="btn" data-action="save-tip" data-match="${m.id}"${canSave ? "" : " disabled"}>Speichern</button>`;
      }
    } else {
      footer += `<span class="badge badge-locked">🔒</span>`;
    }

    let admin = "";
    if (this._isAdmin()) admin = this._renderAdminResultControls(m, results);

    return `<div class="bracket-slot${centerClass}" data-match-id="${m.id}">
      <div class="bracket-slot-head">
        <span class="bracket-id">${escapeHtml(m.id)}</span>
        <span>${escapeHtml(m.stage || "")}</span>
      </div>
      <div class="bracket-team-line">
        ${isBracketPlaceholder(m.home) ? "" : `<span class="team-flag">${teamFlag(m.home)}</span>`}
        <span class="bracket-label" title="${escapeHtml(m.home)}">${escapeHtml(m.home)}</span>
        ${homeScore}
      </div>
      <div class="bracket-team-line">
        ${isBracketPlaceholder(m.away) ? "" : `<span class="team-flag">${teamFlag(m.away)}</span>`}
        <span class="bracket-label" title="${escapeHtml(m.away)}">${escapeHtml(m.away)}</span>
        ${awayScore}
      </div>
      ${footer ? `<div class="bracket-slot-footer">${footer}</div>` : ""}
      ${admin}
    </div>`;
  }

  _renderBracketRoundColumn(title, list, playerTips, results, playerId) {
    if (!list.length) return "";
    return `<div class="bracket-round">
      <div class="bracket-round-title">${escapeHtml(title)}</div>
      <div class="bracket-round-body">${list
        .map((m) => this._renderBracketMatchSlot(m, playerTips, results, playerId))
        .join("")}</div>
    </div>`;
  }

  _renderBracketSide(rounds, side, playerTips, results, playerId) {
    return `<div class="bracket-side ${side}">${rounds
      .map(({ title, list }) => this._renderBracketRoundColumn(title, list, playerTips, results, playerId))
      .join("")}</div>`;
  }

  _renderBracketMobile(rounds, playerTips, results, playerId) {
    return `<div class="bracket-mobile">${rounds
      .map(({ title, list }) => {
        if (!list.length) return "";
        return `<div class="bracket-mobile-round">
          <div class="bracket-round-title">${escapeHtml(title)}</div>
          ${list.map((m) => this._renderBracketMatchSlot(m, playerTips, results, playerId)).join("")}
        </div>`;
      })
      .join("")}</div>`;
  }

  _renderBracket(knockoutMatches, playerTips, results, playerId, players) {
    if (!players.length) {
      return `<div class="empty">
        <div class="empty-icon">👥</div>
        <h3>Spieler fehlen</h3>
        <p>Wechsle zum Tab <strong>Spieler</strong> und füge Mitspieler hinzu.</p>
        <button type="button" class="btn" data-tab="players" style="margin-top:12px">Zu Spieler wechseln</button>
      </div>`;
    }
    if (!playerId) {
      return `<div class="empty"><div class="empty-icon">👤</div><h3>Tipper wählen</h3><p>Oben einen Spieler auswählen.</p></div>`;
    }
    if (!knockoutMatches.length) {
      return `<div class="empty"><div class="empty-icon">🏟️</div><h3>Keine K.o.-Spiele</h3><p>K.o.-Runden in den Karten-Einstellungen aktivieren.</p></div>`;
    }

    const { rounds } = partitionMatches(knockoutMatches);
    const treeRounds = [];
    const mobileRounds = [];
    for (const stage of KNOCKOUT_ROUNDS) {
      const list = rounds.get(stage) || [];
      if (!list.length) continue;
      if (stage === "Finale" || stage === "Spiel um Platz 3") continue;
      const split = splitRoundMatches(list);
      treeRounds.push({ title: stage, left: split.left, right: split.right, all: list });
      mobileRounds.push({ title: stage, list });
    }

    const finale = (rounds.get("Finale") || [])[0];
    const third = (rounds.get("Spiel um Platz 3") || [])[0];
    if (finale) mobileRounds.push({ title: "Finale", list: [finale] });
    if (third) mobileRounds.push({ title: "Spiel um Platz 3", list: [third] });

    const resultIds = Object.keys(results || {}).filter((id) => knockoutMatches.some((m) => m.id === id));
    let adminBar = "";
    if (this._isAdmin() && resultIds.length) {
      adminBar = `<div class="results-admin-bar">
        <span>${resultIds.length} K.o.-Ergebnis${resultIds.length === 1 ? "" : "se"}</span>
        <button type="button" class="btn btn-danger" data-action="clear-all-results">Alle Ergebnisse löschen</button>
      </div>`;
    }

    const leftSide = this._renderBracketSide(
      treeRounds.map((r) => ({ title: r.title, list: r.left })),
      "left",
      playerTips,
      results,
      playerId
    );
    const rightSide = this._renderBracketSide(
      treeRounds.map((r) => ({ title: r.title, list: r.right })).reverse(),
      "right",
      playerTips,
      results,
      playerId
    );
    const center = `<div class="bracket-center">
      ${finale ? this._renderBracketMatchSlot(finale, playerTips, results, playerId, { center: true }) : ""}
      ${third ? this._renderBracketMatchSlot(third, playerTips, results, playerId) : ""}
    </div>`;

    return `${adminBar}<div class="bracket-scroll">
      <div class="bracket-tree">${leftSide}${center}${rightSide}</div>
      ${this._renderBracketMobile(mobileRounds, playerTips, results, playerId)}
    </div>`;
  }

  _tipPoints(tip, result) {
    if (!tip || !result) return null;
    if (tip.home === result.home && tip.away === result.away) return 3;
    const tend = (h, a) => (h > a ? 1 : h < a ? -1 : 0);
    return tend(tip.home, tip.away) === tend(result.home, result.away) ? 1 : 0;
  }

  _renderTips(matches, playerTips, results, playerId, players) {
    if (!players.length) {
      return `<div class="empty">
        <div class="empty-icon">👥</div>
        <h3>Spieler fehlen</h3>
        <p>Wechsle zum Tab <strong>Spieler</strong> und füge Mitspieler hinzu.</p>
        <button type="button" class="btn" data-tab="players" style="margin-top:12px">Zu Spieler wechseln</button>
      </div>`;
    }
    if (!playerId) {
      return `<div class="empty"><div class="empty-icon">👤</div><h3>Tipper wählen</h3><p>Oben einen Spieler auswählen.</p></div>`;
    }
    if (!matches.length) {
      return `<div class="empty"><div class="empty-icon">⚽</div><h3>Keine Spiele</h3><p>Gruppenfilter in den Einstellungen anpassen.</p></div>`;
    }

    return this._renderMatchAccordions(matches, (m) => {
      const locked = isPastKickoff(m.kickoff) && !this._isAdmin();
      const savedTip = playerTips[m.id] || {};
      const draftTip = this._getDraftTip(playerId, m.id);
      const tip = { ...savedTip, ...draftTip };
      const res = results[m.id];
      const homeVal = tip.home ?? "";
      const awayVal = tip.away ?? "";
      const pts = this._tipPoints(tip.home != null && tip.away != null ? tip : null, res);

      const scoreHtml = locked
        ? `<span class="score-static">${homeVal !== "" ? homeVal : "–"}</span><span class="sep">:</span><span class="score-static">${awayVal !== "" ? awayVal : "–"}</span>`
        : `<input class="score-input" type="number" min="0" max="20" inputmode="numeric" data-match="${m.id}" data-side="home" data-kind="tip" value="${homeVal}" />
           <span class="sep">:</span>
           <input class="score-input" type="number" min="0" max="20" inputmode="numeric" data-match="${m.id}" data-side="away" data-kind="tip" value="${awayVal}" />`;

      let extra = "";
      if (res) extra += `<span class="badge badge-result">Ergebnis ${res.home}:${res.away}</span>`;
      if (pts != null && tip.home !== "" && tip.away !== "") {
        extra += `<span class="badge badge-points">+${pts} Punkte</span>`;
      }
      if (!locked) {
        if (this._autoSaveEnabled()) {
          const status = this._tipSaveStatus[m.id] || "";
          extra += `<span class="badge tip-status${status ? ` tip-status-${status}` : ""}" data-match="${m.id}">${
            status === "pending"
              ? "…"
              : status === "saving"
                ? "Speichern…"
                : status === "saved"
                  ? "Gespeichert ✓"
                  : status === "error"
                    ? "Fehler"
                    : ""
          }</span>`;
        } else {
          const canSave = this._tipInputsValid(m.id) || (homeVal !== "" && awayVal !== "");
          extra += `<button type="button" class="btn" data-action="save-tip" data-match="${m.id}"${canSave ? "" : " disabled"}>Tipp speichern</button>`;
        }
      } else if (locked) {
        extra += `<span class="badge badge-locked">🔒 Tippabgabe geschlossen</span>`;
      }

      if (this._isAdmin()) {
        extra += this._renderAdminResultControls(m, results);
      }

      return this._renderMatchTeams(m, scoreHtml, extra);
    });
  }

  async _saveTip(matchId, options = {}) {
    const btn = options.btn || null;
    const silent = Boolean(options.silent);
    if (!this._selectedPlayer) {
      if (!silent) this._showToast("Bitte zuerst einen Spieler auswählen.", "error");
      return;
    }
    if (!matchId) return;

    clearTimeout(this._autoSaveTimers[matchId]);
    delete this._autoSaveTimers[matchId];

    const inputs = this.shadowRoot.querySelectorAll(
      `.score-input[data-match="${matchId}"][data-kind="tip"]`
    );
    let home;
    let away;
    inputs.forEach((inp) => {
      if (inp.getAttribute("data-side") === "home") home = inp.value;
      if (inp.getAttribute("data-side") === "away") away = inp.value;
    });
    if (home === "" || away === "" || Number.isNaN(Number(home)) || Number.isNaN(Number(away))) {
      if (!silent) this._showToast("Bitte beide Tore eingeben.", "error");
      return;
    }

    const homeNum = Number(home);
    const awayNum = Number(away);
    const saved = this._getSavedTip(matchId);
    if (saved && saved.home === homeNum && saved.away === awayNum) {
      this._setTipSaveStatus(matchId, "saved");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Speichern…";
    } else {
      this._setTipSaveStatus(matchId, "saving");
    }

    try {
      await this._callService("set_tip", {
        player_id: this._selectedPlayer,
        match_id: matchId,
        home: homeNum,
        away: awayNum,
      });
      this._applySavedTip(matchId, homeNum, awayNum);
      const playerDrafts = this._draftTipsForPlayer(this._selectedPlayer);
      delete playerDrafts[matchId];
      this._setTipSaveStatus(matchId, "saved");
      if (!silent) {
        this._renderShell();
        this._showToast("Tipp gespeichert ✓", "success");
      }
    } catch (err) {
      console.error("[wm-tippspiel-card] set_tip failed:", err);
      this._setTipSaveStatus(matchId, "error");
      if (!silent) this._showToast(`Speichern fehlgeschlagen: ${err?.message || err}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Tipp speichern";
      }
    }
  }

  async _saveResult(btn) {
    const matchId = btn.getAttribute("data-match");
    const inputs = this.shadowRoot.querySelectorAll(
      `.score-input[data-match="${matchId}"][data-kind="result"]`
    );
    let home;
    let away;
    inputs.forEach((inp) => {
      if (inp.getAttribute("data-side") === "home") home = inp.value;
      if (inp.getAttribute("data-side") === "away") away = inp.value;
    });
    if (home === "" || away === "" || Number.isNaN(Number(home)) || Number.isNaN(Number(away))) {
      this._showToast("Bitte beide Ergebnis-Tore eingeben.", "error");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Speichern…";
    try {
      await this._callService("set_result", {
        match_id: matchId,
        home: Number(home),
        away: Number(away),
      });
      this._applySavedResult(matchId, Number(home), Number(away));
      delete this._draftResults[matchId];
      this._renderShell();
      this._showToast("Ergebnis gespeichert ✓", "success");
    } catch (err) {
      console.error("[wm-tippspiel-card] set_result failed:", err);
      this._showToast(`Speichern fehlgeschlagen: ${err?.message || err}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Speichern";
    }
  }

  async _clearResult(btn) {
    const matchId = btn.getAttribute("data-match");
    if (!matchId) return;
    btn.disabled = true;
    btn.textContent = "Löschen…";
    try {
      await this._callService("clear_result", { match_id: matchId });
      this._applyClearedResult(matchId);
      delete this._draftResults[matchId];
      this._renderShell();
      this._showToast("Ergebnis gelöscht ✓", "success");
    } catch (err) {
      console.error("[wm-tippspiel-card] clear_result failed:", err);
      this._showToast(`Löschen fehlgeschlagen: ${err?.message || err}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Ergebnis löschen";
    }
  }

  async _clearAllResults(btn) {
    const count = Object.keys(this._state?.attributes?.results || {}).length;
    if (!count) {
      this._showToast("Es sind keine Ergebnisse gespeichert.", "error");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Löschen…";
    try {
      await this._callService("clear_all_results", {});
      this._applyClearedAllResults();
      this._draftResults = {};
      this._renderShell();
      this._showToast("Alle Ergebnisse gelöscht ✓", "success");
    } catch (err) {
      console.error("[wm-tippspiel-card] clear_all_results failed:", err);
      this._showToast(`Löschen fehlgeschlagen: ${err?.message || err}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Alle Ergebnisse löschen";
    }
  }
}

customElements.define("wm-tippspiel-card", WmTippspielCard);
customElements.define("wm-tippspiel-card-editor", WmTippspielCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "wm-tippspiel-card",
  name: "WM Tippspiel",
  description: "Fußball-WM Tippspiel mit Rangliste, Editor und Tippabgabe",
  preview: true,
  configurable: true,
});

console.info(`WM Tippspiel Card v${WM_TIPPSPIEL_CARD_VERSION} geladen`);
