const WM_TIPPSPIEL_CARD_VERSION = "1.9.0";
const AUTO_SAVE_DELAY_MS = 400;
const MATCH_TIP_STATUS_CLASSES = [
  "tip-status-saved",
  "tip-status-soon",
  "tip-status-locked",
  "tip-status-exact",
];

const ALL_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const KNOCKOUT_ROUNDS = [
  "Sechzehntelfinale",
  "Achtelfinale",
  "Viertelfinale",
  "Halbfinale",
  "Spiel um Platz 3",
  "Finale",
];
const DEFAULT_ACCENT = "#87B8E0";
const DEFAULT_ACCENT_DARK = "#6BA3D0";
const DEFAULT_ACCENT_2 = "#22c55e";
const KICKOFF_SOON_MINUTES = 120;
const FLAG_CDN = "https://flagcdn.com/w40";

const TABS = [
  { id: "tips", label: "Vorrunde", icon: "mdi:soccer" },
  { id: "bracket", label: "KO-Runde", icon: "mdi:tournament", knockout: true },
  { id: "calendar", label: "Kalender", icon: "mdi:calendar-month" },
  { id: "standings", label: "Rangliste", icon: "mdi:podium-gold" },
];

const DISPLAY_TIMEZONE = "Europe/Berlin";
const CALENDAR_WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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
  Frankreich: "fr",
  Senegal: "sn",
  Irak: "iq",
  Norwegen: "no",
  Argentinien: "ar",
  Algerien: "dz",
  Österreich: "at",
  Jordanien: "jo",
  Portugal: "pt",
  "DR Kongo": "cd",
  Usbekistan: "uz",
  Kolumbien: "co",
  England: "gb-eng",
  Kroatien: "hr",
  Ghana: "gh",
  Panama: "pa",
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

function teamLabel(name) {
  const full = escapeHtml(name || "Team");
  return `<span class="team-label" title="${full}">${full}</span>`;
}

function teamDisplayName(name) {
  if (!name || isBracketPlaceholder(name)) return escapeHtml(name || "");
  return teamLabel(name);
}

function parseKickoffDate(iso) {
  if (!iso) return null;
  const normalized = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function berlinDayIdFromDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `date-${y}-${m}-${day}`;
}

function berlinTodayDayId() {
  return berlinDayIdFromDate(new Date());
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatKickoff(iso) {
  const date = parseKickoffDate(iso);
  if (!date) return "–";
  return `${new Intl.DateTimeFormat("de-DE", {
    timeZone: DISPLAY_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)} MESZ`;
}

function formatKickoffTime(iso) {
  const date = parseKickoffDate(iso);
  if (!date) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function kickoffDayId(iso) {
  const date = parseKickoffDate(iso);
  if (!date) return "date-unknown";
  return berlinDayIdFromDate(date);
}

function buildCalendarMonth(year, month, matchesByDayId) {
  const todayId = berlinTodayDayId();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const cells = [];

  const pushDay = (date, inMonth) => {
    const dayId = berlinDayIdFromDate(date);
    cells.push({
      date,
      dayId,
      inMonth,
      isToday: dayId === todayId,
      matches: matchesByDayId.get(dayId) || [],
    });
  };

  for (let i = startOffset; i > 0; i--) {
    pushDay(new Date(year, month, 1 - i), false);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    pushDay(new Date(year, month, day), true);
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    pushDay(new Date(year, month + 1, nextDay), false);
    nextDay += 1;
    if (cells.length >= 42 && cells.length % 7 === 0) break;
  }
  return cells;
}

function kickoffDayLabel(iso) {
  if (!iso) return "Datum unbekannt";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isPastKickoff(iso, bufferMinutes = 0) {
  if (!iso) return false;
  return Date.now() >= new Date(iso).getTime() - bufferMinutes * 60 * 1000;
}

function minutesUntilKickoff(iso) {
  if (!iso) return null;
  return (new Date(iso).getTime() - Date.now()) / 60000;
}

function mergeTipWithDraft(savedTip, draftTip) {
  if (!draftTip || !Object.keys(draftTip).length) return savedTip || {};
  return {
    home: draftTip.home !== undefined ? draftTip.home : savedTip?.home ?? "",
    away: draftTip.away !== undefined ? draftTip.away : savedTip?.away ?? "",
  };
}

function matchTipStatus(m, tip, res) {
  if (isPastKickoff(m.kickoff, 0)) return "locked";
  if (res && tip?.home != null && tip?.away != null && tip.home !== "" && tip.away !== "") {
    if (Number(tip.home) === Number(res.home) && Number(tip.away) === Number(res.away)) {
      return "exact";
    }
  }
  if (tip?.home != null && tip?.away != null && tip.home !== "" && tip.away !== "") return "saved";
  const mins = minutesUntilKickoff(m.kickoff);
  if (mins != null && mins >= 0 && mins <= KICKOFF_SOON_MINUTES) return "soon";
  return "pending";
}

function tipStatusLabel(status) {
  if (status === "saved") return "Tipp abgegeben";
  if (status === "soon") return "Anpfiff bald";
  if (status === "locked") return "Gesperrt";
  if (status === "exact") return "Exakter Tipp";
  return "";
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
    subtitle: "Fußball-WM 2026 · Tipprunde",
    player_id: "",
    admin: false,
    show_groups: [...ALL_GROUPS],
    show_knockout: true,
    show_rules: true,
    match_columns: "auto",
    auto_save_tips: true,
    compact_mode: true,
    show_group_tables: true,
    accent_color: DEFAULT_ACCENT,
    ...overrides,
  };
}

/* ============================== Editor ============================== */

class WmTippspielCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = defaultConfig(config || {});
    this._newPlayerName = "";
    this._pendingRemovePlayerId = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    if (!this._config) return;
    const entity = this._config.entity;
    const prevPlayers = entity ? prev?.states?.[entity]?.attributes?.players : null;
    const nextPlayers = entity ? hass?.states?.[entity]?.attributes?.players : null;
    const playersChanged = JSON.stringify(prevPlayers) !== JSON.stringify(nextPlayers);
    if (!prev || playersChanged || !this.querySelector(".ed")) {
      this._render();
      return;
    }
    const picker = this.querySelector('ha-entity-picker[data-key="entity"]');
    if (picker) picker.hass = hass;
  }

  _players() {
    const st = this._hass?.states?.[this._config.entity];
    return st?.attributes?.players || [];
  }

  _entryId() {
    const entityId = this._config?.entity;
    const st = this._hass?.states?.[entityId];
    if (st?.attributes?.entry_id) return st.attributes.entry_id;
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
    await this._callService("add_player", { name });
    this._newPlayerName = "";
    this._render();
  }

  async _removePlayer(playerId) {
    if (!playerId || !this._hass) return;
    if (!this._config.admin) return;
    try {
      await this._callService("remove_player", { player_id: playerId });
      this._pendingRemovePlayerId = null;
      if (this._config.player_id === playerId) {
        this._set("player_id", "");
      }
      this._render();
    } catch (err) {
      console.error("[wm-tippspiel-card-editor] remove_player failed:", err);
    }
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
      el.value = cfg[key] ?? (key === "accent_color" ? DEFAULT_ACCENT : "");
      el.addEventListener("change", (ev) => {
        this._set(key, ev.target.value);
      });
    });

    const playerInput = this.querySelector(".ed-player-input");
    if (playerInput) {
      playerInput.value = this._newPlayerName || "";
      playerInput.addEventListener("input", (ev) => {
        this._newPlayerName = ev.target.value;
      });
      playerInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          void this._addPlayer();
        }
      });
    }

    this.querySelectorAll(".ed-chip[data-player]").forEach((chip) => {
      chip.addEventListener("click", () => {
        this._set("player_id", chip.getAttribute("data-player"));
      });
    });

    this.querySelector("[data-action=add-player]")?.addEventListener("click", () => this._addPlayer());

    this.querySelectorAll("[data-action=ed-remove-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._pendingRemovePlayerId = btn.getAttribute("data-player-id");
        this._render();
      });
    });
    this.querySelectorAll("[data-action=ed-confirm-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void this._removePlayer(btn.getAttribute("data-player-id"));
      });
    });
    this.querySelector("[data-action=ed-cancel-remove]")?.addEventListener("click", () => {
      this._pendingRemovePlayerId = null;
      this._render();
    });

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
    const active = document.activeElement;
    if (active?.classList?.contains("ed-player-input")) {
      this._newPlayerName = active.value;
    }

    const cfg = this._config;
    const players = this._players();
    const pendingId = this._pendingRemovePlayerId;

    const playerList = players.length
      ? players
          .map((p) => {
            if (pendingId === p.id) {
              return `<div class="ed-player-row ed-player-confirm">
                <div>
                  <strong>${escapeHtml(p.name)}</strong> wirklich entfernen?
                  <div class="ed-player-meta">Alle Tipps dieses Spielers werden gelöscht.</div>
                </div>
                <div class="ed-player-actions">
                  <button type="button" class="ed-btn ed-btn-danger" data-action="ed-confirm-remove" data-player-id="${escapeHtml(p.id)}">Ja, löschen</button>
                  <button type="button" class="ed-btn" data-action="ed-cancel-remove">Abbrechen</button>
                </div>
              </div>`;
            }
            return `<div class="ed-player-row">
              <button type="button" class="ed-chip ${p.id === cfg.player_id ? "active" : ""}" data-player="${escapeHtml(p.id)}" title="Als Standard-Tipper wählen">${escapeHtml(p.name)}</button>
              <span class="ed-player-meta">ID ${escapeHtml(p.id)}</span>
              ${
                cfg.admin
                  ? `<button type="button" class="ed-btn ed-btn-danger ed-remove" data-action="ed-remove-player" data-player-id="${escapeHtml(p.id)}">Entfernen</button>`
                  : ""
              }
            </div>`;
          })
          .join("")
      : `<p class="ed-empty">Noch keine Spieler – unten einen Namen hinzufügen.</p>`;

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
          <div class="ed-title">Spielerverwaltung</div>
          <p class="ed-hint">Mitspieler werden in der Integration gespeichert und stehen auf allen Geräten zur Verfügung. Standard-Tipper per Klick auf den Namen wählen.</p>
          <div class="ed-add-box">
            <label class="ed-player-field">
              <span class="ed-player-label">Neuer Spieler</span>
              <input
                type="text"
                class="ed-player-input"
                placeholder="Name eingeben…"
                value="${escapeHtml(this._newPlayerName || "")}"
                autocomplete="off"
              />
            </label>
            <button type="button" class="ed-btn ed-btn-primary ed-btn-icon" data-action="add-player" title="Spieler hinzufügen" aria-label="Spieler hinzufügen">+</button>
          </div>
          <div class="ed-player-list">${playerList}</div>
          ${!cfg.admin ? `<p class="ed-hint">Spieler entfernen ist nur mit aktiviertem Admin-Modus (unten bei Anzeige) möglich.</p>` : ""}
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
          <ha-formfield label="Kompakter Modus (eine Zeile pro Spiel)">
            <ha-switch data-key="compact_mode"></ha-switch>
          </ha-formfield>
          <ha-formfield label="Gruppentabellen in der Vorrunde">
            <ha-switch data-key="show_group_tables"></ha-switch>
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
        .ed-player-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }
        .ed-player-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
        }
        .ed-player-confirm {
          border-color: rgba(244, 67, 54, 0.45);
          background: rgba(244, 67, 54, 0.08);
        }
        .ed-player-meta {
          font-size: 11px;
          color: var(--secondary-text-color);
          flex: 1;
          min-width: 72px;
        }
        .ed-player-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ed-remove {
          margin-left: auto;
        }
        .ed-chip {
          padding: 6px 12px;
          border-radius: 999px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          font-size: 13px;
          cursor: pointer;
          color: inherit;
          font-family: inherit;
        }
        .ed-chip.active {
          border-color: var(--primary-color);
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
          font-weight: 600;
        }
        .ed-add-row,
        .ed-add-box {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 14px;
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
        }
        .ed-add-box ha-textfield {
          margin-bottom: 0;
        }
        .ed-player-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .ed-player-label {
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        .ed-player-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          padding: 10px 12px;
          font-size: 14px;
          font-family: inherit;
        }
        .ed-player-input:focus {
          outline: 2px solid var(--primary-color);
          border-color: var(--primary-color);
        }
        .ed-btn {
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-family: inherit;
          white-space: nowrap;
        }
        .ed-btn-primary {
          border: none;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          padding: 10px 16px;
        }
        .ed-btn-icon {
          min-width: 42px;
          padding: 10px 12px;
          font-size: 1.25rem;
          font-weight: 800;
          line-height: 1;
        }
        .ed-btn-danger {
          color: var(--error-color, #f44336);
          border-color: rgba(244, 67, 54, 0.45);
        }
        .ed-groups {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
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
    this._openAccordions = this._openAccordions || new Set();
    this._autoSaveTimers = this._autoSaveTimers || {};
    this._tipSaveStatus = this._tipSaveStatus || {};
    this._persistChains = this._persistChains || {};
    this._dirtyTips = this._dirtyTips || new Set();
    this._tipsSnapshot = this._tipsSnapshot || {};
    this._displayedPlayerId = this._displayedPlayerId ?? null;
    this._tipsViewMode = this._tipsViewMode || "group";
    if (!this._selectedTipGroupsList) {
      this._selectedTipGroupsList = [...normalizeGroups(this._config.show_groups)];
    }
    this._selectedTipTeamsList = this._selectedTipTeamsList || [];
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
        const nextTab = tabBtn.getAttribute("data-tab");
        void this._flushPendingTipsBeforeUiChange().then(() => {
          this._tab = nextTab;
          this._renderShell();
        });
        return;
      }
      const playerBtn = ev.target.closest(".player-chip[data-player-id]");
      if (playerBtn) {
        void this._switchPlayer(playerBtn.getAttribute("data-player-id"));
        return;
      }
      const tipsViewBtn = ev.target.closest("[data-tips-view]");
      if (tipsViewBtn) {
        const mode = tipsViewBtn.getAttribute("data-tips-view");
        if (mode === "group" || mode === "date" || mode === "team") {
          void this._flushPendingTipsBeforeUiChange().then(() => {
            this._tipsViewMode = mode;
            this._openAccordions.clear();
            this._renderShell();
          });
        }
        return;
      }
      const groupChip = ev.target.closest("[data-group-chip]");
      if (groupChip) {
        const group = groupChip.getAttribute("data-group-chip");
        if (group) {
          const set = new Set(this._selectedTipGroupsList || []);
          if (set.has(group)) set.delete(group);
          else set.add(group);
          this._selectedTipGroupsList = ALL_GROUPS.filter((g) => set.has(g));
          this._openAccordions.clear();
          this._renderShell();
        }
        return;
      }
      const teamChip = ev.target.closest("[data-team-chip]");
      if (teamChip) {
        const team = teamChip.getAttribute("data-team-chip");
        if (team) {
          const list = [...(this._selectedTipTeamsList || [])];
          const idx = list.indexOf(team);
          if (idx >= 0) list.splice(idx, 1);
          else list.push(team);
          list.sort((a, b) => a.localeCompare(b, "de"));
          this._selectedTipTeamsList = list;
          this._openAccordions.clear();
          this._renderShell();
        }
        return;
      }
      const calendarNav = ev.target.closest("[data-calendar-nav]");
      if (calendarNav) {
        const dir = calendarNav.getAttribute("data-calendar-nav");
        const view = this._calendarMonth || this._initialCalendarMonth(this._data().matches || []);
        const d = new Date(view.year, view.month + (dir === "next" ? 1 : -1), 1);
        this._calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
        this._renderShell();
        return;
      }
      const calendarEvent = ev.target.closest("[data-calendar-event]");
      if (calendarEvent) {
        this._calendarSelectedMatchId = calendarEvent.getAttribute("data-calendar-event");
        this._renderShell();
        return;
      }
      const calendarClose = ev.target.closest("[data-action=calendar-close]");
      if (calendarClose) {
        this._calendarSelectedMatchId = null;
        this._renderShell();
        return;
      }
      const saveTip = ev.target.closest("[data-action=save-tip]");
      if (saveTip) {
        ev.preventDefault();
        this._persistTip(saveTip.getAttribute("data-match"), { btn: saveTip });
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
    });

    this.shadowRoot.addEventListener("input", (ev) => {
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
      const playerId = this._selectedPlayer;
      this._syncDraftTipFromDom(matchId, playerId);
      this._markTipDirty(playerId, matchId);
      this._syncMatchTipVisuals(matchId);
      if (this._config.auto_save_tips !== false) {
        if (this._shouldClearTip(matchId, playerId)) {
          this._clearAutoSaveTimer(matchId);
          void this._persistTip(matchId, { silent: true, playerId });
        } else {
          this._scheduleAutoSaveTip(matchId, playerId);
        }
      } else {
        this._syncTipSaveButton(matchId);
      }
    });

    this.shadowRoot.addEventListener(
      "blur",
      (ev) => {
        const input = ev.target.closest('.score-input[data-kind="tip"]');
        if (!input) return;
        const matchId = input.getAttribute("data-match");
        if (!matchId || !this._selectedPlayer || this._config.auto_save_tips === false) return;
        void this._persistTip(matchId, { silent: true, playerId: this._selectedPlayer });
      },
      true
    );

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
    });

    this.shadowRoot.addEventListener(
      "toggle",
      (ev) => {
        const det = ev.target.closest("details.accordion");
        if (!det) return;
        const id = det.getAttribute("data-acc-id");
        if (!id) return;
        if (det.open) {
          this._openAccordions.add(id);
        } else {
          this._openAccordions.delete(id);
          if (this._tab === "tips" || this._tab === "bracket") {
            void this._flushPendingTipsBeforeUiChange();
          }
        }
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
    const playerEntities = a.player_entities || {};
    const playerTipsFp = {};
    if (this._selectedPlayer && playerEntities[this._selectedPlayer]) {
      const ent = this._hass?.states[playerEntities[this._selectedPlayer]];
      playerTipsFp[this._selectedPlayer] = ent?.attributes?.tips;
    } else if (this._selectedPlayer && a.tips?.[this._selectedPlayer]) {
      playerTipsFp[this._selectedPlayer] = a.tips[this._selectedPlayer];
    }
    return JSON.stringify({
      players: a.players,
      standings: a.standings,
      matches: a.matches,
      results: a.results,
      group_tables: a.group_tables,
      playerTips: playerTipsFp,
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

  _applySavedTip(matchId, home, away, playerId = this._selectedPlayer) {
    if (!playerId) return;
    const tipKey = String(matchId);
    const ent = this._state?.attributes?.player_entities?.[playerId];
    if (ent && this._hass?.states[ent]) {
      const st = this._hass.states[ent];
      const tips = { ...(st.attributes?.tips || {}) };
      const oldKey = this._resolveTipMatchKey(tips, matchId);
      if (oldKey && oldKey !== tipKey) delete tips[oldKey];
      tips[tipKey] = { home, away };
      this._hass.states[ent] = {
        ...st,
        attributes: { ...st.attributes, tips },
      };
    } else if (this._state?.attributes) {
      const attrs = this._state.attributes;
      const tips = { ...(attrs.tips || {}) };
      tips[playerId] = { ...(tips[playerId] || {}), [matchId]: { home, away } };
      this._state = { ...this._state, attributes: { ...attrs, tips } };
    }
    this._stateFingerprintCache = this._stateFingerprint(this._state);
    this._updateTipSnapshot(tipKey, playerId, { home, away });
  }

  _applyClearedTip(matchId, playerId = this._selectedPlayer) {
    if (!playerId) return;
    const ent = this._state?.attributes?.player_entities?.[playerId];
    if (ent && this._hass?.states[ent]) {
      const st = this._hass.states[ent];
      const tips = { ...(st.attributes?.tips || {}) };
      const key = this._resolveTipMatchKey(tips, matchId);
      if (key) delete tips[key];
      this._hass.states[ent] = {
        ...st,
        attributes: { ...st.attributes, tips },
      };
    } else if (this._state?.attributes) {
      const attrs = this._state.attributes;
      const tips = { ...(attrs.tips || {}) };
      if (tips[playerId]) {
        tips[playerId] = { ...tips[playerId] };
        const key = this._resolveTipMatchKey(tips[playerId], matchId);
        if (key) delete tips[playerId][key];
      }
      this._state = { ...this._state, attributes: { ...attrs, tips } };
    }
    this._stateFingerprintCache = this._stateFingerprint(this._state);
    this._updateTipSnapshot(matchId, playerId, null);
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

  _tipInputElements(matchId) {
    return {
      homeIn: this.shadowRoot?.querySelector(
        `.score-input[data-match="${matchId}"][data-side="home"][data-kind="tip"]`
      ),
      awayIn: this.shadowRoot?.querySelector(
        `.score-input[data-match="${matchId}"][data-side="away"][data-kind="tip"]`
      ),
    };
  }

  _persistKey(playerId, matchId) {
    return `${playerId}::${matchId}`;
  }

  _clearAutoSaveTimer(matchId) {
    const entry = this._autoSaveTimers?.[matchId];
    if (!entry) return;
    clearTimeout(entry.handle ?? entry);
    delete this._autoSaveTimers[matchId];
  }

  _markTipDirty(playerId, matchId) {
    if (!playerId || !matchId) return;
    this._dirtyTips.add(this._persistKey(playerId, matchId));
  }

  _clearTipDirty(playerId, matchId) {
    if (!playerId || !matchId) return;
    this._dirtyTips.delete(this._persistKey(playerId, matchId));
  }

  _readTipFieldValues(matchId, playerId = this._selectedPlayer) {
    const draft = this._getDraftTip(playerId, matchId);
    const hasDraft = draft && Object.keys(draft).length > 0;
    const saved = this._getStoredTipFromMap(this._playerTipsFor(playerId), matchId) || {};
    if (hasDraft) {
      return {
        home: draft.home !== undefined ? draft.home : saved.home ?? "",
        away: draft.away !== undefined ? draft.away : saved.away ?? "",
      };
    }
    if (playerId === this._selectedPlayer) {
      const { homeIn, awayIn } = this._tipInputElements(matchId);
      return {
        home: homeIn?.value ?? "",
        away: awayIn?.value ?? "",
      };
    }
    return {
      home: saved.home ?? "",
      away: saved.away ?? "",
    };
  }

  _tipInputsValid(matchId, playerId = this._selectedPlayer) {
    const { home, away } = this._readTipFieldValues(matchId, playerId);
    return home !== "" && away !== "" && !Number.isNaN(Number(home)) && !Number.isNaN(Number(away));
  }

  _tipInputsEmpty(matchId, playerId = this._selectedPlayer) {
    const { home, away } = this._readTipFieldValues(matchId, playerId);
    return home === "" && away === "";
  }

  async _flushScheduledTipPersists() {
    if (!this._autoSaveEnabled()) return;
    const pending = Object.entries(this._autoSaveTimers || {});
    for (const [matchId, entry] of pending) {
      const playerId = entry?.playerId ?? this._selectedPlayer;
      this._clearAutoSaveTimer(matchId);
      if (!playerId) continue;
      await this._persistTip(matchId, { silent: true, playerId });
    }
  }

  async _flushDirtyTipsForPlayer(playerId) {
    if (!playerId || !this._autoSaveEnabled() || !this._dirtyTips?.size) return;
    const prefix = `${playerId}::`;
    const keys = [...this._dirtyTips].filter((key) => key.startsWith(prefix));
    for (const key of keys) {
      const matchId = key.slice(prefix.length);
      await this._persistTip(matchId, { silent: true, playerId });
    }
  }

  async _flushPendingTipsBeforeUiChange() {
    const playerId = this._displayedPlayerId ?? this._selectedPlayer;
    if (!playerId) return;
    if (this._tab === "tips" || this._tab === "bracket") {
      this._captureDraftInputsFromDom(playerId);
    }
    await this._flushScheduledTipPersists();
    await this._flushDirtyTipsForPlayer(playerId);
  }

  async _switchPlayer(nextId) {
    if (!nextId || nextId === this._selectedPlayer) return;
    const prevId = this._displayedPlayerId ?? this._selectedPlayer;
    if (prevId) {
      this._captureDraftInputsFromDom(prevId);
      await this._flushScheduledTipPersists();
      await this._flushDirtyTipsForPlayer(prevId);
    }
    delete this._draftTips[nextId];
    this._selectedPlayer = nextId;
    this._renderShell();
  }

  _resetTipSaveBadge(matchId) {
    delete this._tipSaveStatus[matchId];
    clearTimeout(this._tipSaveStatusTimers?.[matchId]);
    const el = this.shadowRoot?.querySelector(`.tip-status[data-match="${matchId}"]`);
    if (el) {
      el.className = "badge tip-status";
      el.textContent = "";
    }
  }

  _syncMatchTipVisuals(matchId) {
    const match = (this._state?.attributes?.matches || []).find((m) => m.id === matchId);
    if (!match || !this._selectedPlayer || !this.shadowRoot) return;
    const results = this._state?.attributes?.results || {};
    const savedTip =
      this._getStoredTipFromMap(this._playerTipsFor(this._selectedPlayer), matchId) || {};
    const draftTip = this._getDraftTip(this._selectedPlayer, matchId);
    const tip = mergeTipWithDraft(savedTip, draftTip);
    const res = results[matchId];
    const status = matchTipStatus(match, tip, res);
    const statusClass = status ? `tip-status-${status}` : "";

    for (const el of this.shadowRoot.querySelectorAll(`[data-match-id="${matchId}"]`)) {
      MATCH_TIP_STATUS_CLASSES.forEach((cls) => el.classList.remove(cls));
      if (statusClass) el.classList.add(statusClass);
    }

    const badge = this.shadowRoot.querySelector(`.match[data-match-id="${matchId}"] .match-status-badge`);
    const label = tipStatusLabel(status);
    if (badge) {
      if (label) {
        badge.className = `match-status-badge status-${status}`;
        badge.textContent = label;
        badge.style.display = "";
      } else {
        badge.style.display = "none";
        badge.textContent = "";
      }
    }

    const pts = this._tipPoints(
      tip.home != null && tip.away != null && tip.home !== "" && tip.away !== "" ? tip : null,
      res
    );
    for (const container of [
      this.shadowRoot.querySelector(`.match[data-match-id="${matchId}"]`),
      this.shadowRoot.querySelector(`.bracket-slot[data-match-id="${matchId}"]`),
    ]) {
      if (!container) continue;
      const pointsBadge = container.querySelector(".badge-points");
      if (!pointsBadge) continue;
      if (pts != null && tip.home !== "" && tip.away !== "") {
        if (container.classList.contains("bracket-slot")) {
          pointsBadge.textContent = `+${pts}`;
        } else {
          pointsBadge.textContent = `+${pts} Punkte`;
        }
        pointsBadge.style.display = "";
      } else {
        pointsBadge.style.display = "none";
      }
    }
  }

  _syncTipSaveButton(matchId) {
    const btn = this.shadowRoot?.querySelector(`[data-action=save-tip][data-match="${matchId}"]`);
    if (btn) btn.disabled = !this._tipInputsValid(matchId);
  }

  _autoSaveEnabled() {
    return this._config.auto_save_tips !== false;
  }

  _resolveTipMatchKey(tips, matchId) {
    if (!tips || matchId == null || matchId === "") return null;
    if (tips[matchId] != null) return matchId;
    const mid = String(matchId);
    for (const key of Object.keys(tips)) {
      if (String(key) === mid) return key;
    }
    return null;
  }

  _getStoredTipFromMap(tips, matchId) {
    const key = this._resolveTipMatchKey(tips, matchId);
    return key != null ? tips[key] : null;
  }

  _getSavedTip(matchId, playerId = this._selectedPlayer) {
    if (!playerId) return null;
    const live = this._getStoredTipFromMap(this._playerTipsFor(playerId), matchId);
    if (live) return live;
    return this._getSnapshottedTip(matchId, playerId);
  }

  _getSnapshottedTip(matchId, playerId) {
    const snap = this._tipsSnapshot?.[playerId];
    if (!snap) return null;
    return this._getStoredTipFromMap(snap, matchId);
  }

  _snapshotPlayerTips(playerId = this._selectedPlayer) {
    if (!playerId) return;
    this._tipsSnapshot[playerId] = { ...this._playerTipsFor(playerId) };
  }

  _updateTipSnapshot(matchId, playerId, tipOrNull) {
    if (!playerId) return;
    const bucket = { ...(this._tipsSnapshot[playerId] || {}) };
    const key = this._resolveTipMatchKey(bucket, matchId) ?? matchId;
    if (tipOrNull) bucket[key] = tipOrNull;
    else delete bucket[key];
    this._tipsSnapshot[playerId] = bucket;
  }

  _syncDraftTipFromDom(matchId, playerId) {
    const { homeIn, awayIn } = this._tipInputElements(matchId);
    if (!homeIn || !awayIn) return;
    const bucket = this._draftTipsForPlayer(playerId);
    bucket[matchId] = { home: homeIn.value ?? "", away: awayIn.value ?? "" };
  }

  _hasStoredTipForClear(matchId, playerId) {
    if (!playerId) return false;
    return Boolean(this._getSavedTip(matchId, playerId));
  }

  _discardTipDraft(matchId, playerId) {
    delete this._draftTipsForPlayer(playerId)[matchId];
    this._clearTipDirty(playerId, matchId);
    if (playerId === this._selectedPlayer) {
      this._syncMatchTipVisuals(matchId);
      this._resetTipSaveBadge(matchId);
    }
  }

  _shouldClearTip(matchId, playerId = this._selectedPlayer) {
    return this._tipInputsEmpty(matchId, playerId) && this._hasStoredTipForClear(matchId, playerId);
  }

  _playerTipsFor(playerId, attrs = null) {
    const a = attrs || this._state?.attributes || {};
    const ent = (a.player_entities || {})[playerId];
    if (ent && this._hass?.states[ent]) {
      return this._hass.states[ent].attributes?.tips || {};
    }
    return (a.tips || {})[playerId] || {};
  }

  _scheduleAutoSaveTip(matchId, playerId = this._selectedPlayer) {
    if (!this._autoSaveEnabled() || !playerId) return;
    const match = (this._state?.attributes?.matches || []).find((m) => m.id === matchId);
    if (match && isPastKickoff(match.kickoff, 0)) return;
    this._clearAutoSaveTimer(matchId);
    const canSave = this._tipInputsValid(matchId, playerId);
    const canClear = this._shouldClearTip(matchId, playerId);
    if (!canSave && !canClear) {
      this._resetTipSaveBadge(matchId);
      return;
    }
    this._setTipSaveStatus(matchId, "pending");
    this._autoSaveTimers[matchId] = {
      playerId,
      handle: setTimeout(() => {
        delete this._autoSaveTimers[matchId];
        void this._persistTip(matchId, { silent: true, playerId });
      }, AUTO_SAVE_DELAY_MS),
    };
  }

  async _persistTip(matchId, options = {}) {
    const playerId = options.playerId ?? this._selectedPlayer;
    if (!playerId || !matchId) return;
    const chainKey = this._persistKey(playerId, matchId);
    const prior = this._persistChains[chainKey] || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this._persistChains[chainKey] = gate;
    await prior;
    try {
      this._clearAutoSaveTimer(matchId);
      await this._persistTipNow(matchId, { ...options, playerId });
    } finally {
      release();
      if (this._persistChains[chainKey] === gate) {
        delete this._persistChains[chainKey];
      }
    }
  }

  async _persistTipNow(matchId, options = {}) {
    const playerId = options.playerId ?? this._selectedPlayer;
    if (!playerId) return;
    if (this._tipInputsValid(matchId, playerId)) {
      await this._saveTip(matchId, { ...options, playerId });
      return;
    }
    if (this._tipInputsEmpty(matchId, playerId)) {
      if (this._hasStoredTipForClear(matchId, playerId)) {
        await this._clearTip(matchId, { ...options, playerId, force: true });
      } else {
        this._discardTipDraft(matchId, playerId);
      }
      return;
    }
    if (playerId === this._selectedPlayer) {
      this._syncMatchTipVisuals(matchId);
      this._resetTipSaveBadge(matchId);
    }
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
      const firstRender = !this._shellReady;
      void this._flushAndRender(firstRender);
    }
  }

  _flushAndRender(firstRender) {
    this._flushRenderChain = (this._flushRenderChain || Promise.resolve()).then(() =>
      this._flushAndRenderNow(firstRender)
    );
    return this._flushRenderChain;
  }

  async _flushAndRenderNow(firstRender) {
    const captureId = this._displayedPlayerId ?? this._selectedPlayer;
    if ((this._tab === "tips" || this._tab === "bracket" || this._tab === "calendar") && captureId) {
      this._captureDraftInputsFromDom(captureId);
    }
    await this._flushScheduledTipPersists();
    if (captureId) await this._flushDirtyTipsForPlayer(captureId);
    this._renderShell();
    if (firstRender) this._shellReady = true;
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
    const playerId = this._selectedPlayer;
    const tips = {};
    if (playerId) tips[playerId] = this._playerTipsFor(playerId, a);
    return {
      standings: a.standings || [],
      players,
      matches: a.matches || [],
      tips,
      results: a.results || {},
      group_tables: a.group_tables || {},
      player_entities: a.player_entities || {},
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
    if (this._tab === "tips" && this._tipsViewMode === "date" && this._defaultDateAccordionId) {
      return this._defaultDateAccordionId;
    }
    if (this._tab === "tips" && this._tipsViewMode === "team") {
      const teams = this._selectedTipTeamsList || [];
      return teams.length === 1 ? `team-${teams[0]}` : null;
    }
    const groups = this._selectedTipGroupsList || normalizeGroups(this._config.show_groups);
    const preferred = groups.includes("E") ? "E" : groups[0];
    return preferred ? `group-${preferred}` : null;
  }

  _groupStageTeams(matches) {
    const names = new Set();
    for (const m of matches) {
      if (!m.group) continue;
      if (m.home && !isBracketPlaceholder(m.home)) names.add(m.home);
      if (m.away && !isBracketPlaceholder(m.away)) names.add(m.away);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "de"));
  }

  _initialCalendarMonth(matches) {
    const dated = matches
      .map((m) => parseKickoffDate(m.kickoff))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());
    if (!dated.length) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() };
    }
    const todayId = berlinTodayDayId();
    const todayMatch = matches.find((m) => m.kickoff && kickoffDayId(m.kickoff) === todayId);
    const ref = todayMatch ? parseKickoffDate(todayMatch.kickoff) : dated[0];
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DISPLAY_TIMEZONE,
      year: "numeric",
      month: "numeric",
    }).formatToParts(ref);
    return {
      year: Number(parts.find((p) => p.type === "year")?.value),
      month: Number(parts.find((p) => p.type === "month")?.value) - 1,
    };
  }

  _calendarMonthRange(matches) {
    const keys = [];
    for (const m of matches) {
      if (!m.kickoff) continue;
      keys.push(kickoffDayId(m.kickoff).replace("date-", ""));
    }
    keys.sort();
    if (!keys.length) return null;
    const [minY, minM] = keys[0].split("-").map(Number);
    const [maxY, maxM] = keys[keys.length - 1].split("-").map(Number);
    return { minKey: monthKey(minY, minM - 1), maxKey: monthKey(maxY, maxM - 1) };
  }

  _createMatchRenderer(playerTips, results, playerId) {
    const compact = this._config.compact_mode !== false;
    return (m) => {
      const ctx = this._buildMatchTipContext(m, playerTips, results, playerId);
      const { locked, homeVal, awayVal, status } = ctx;
      const scoreHtml = locked
        ? `<span class="score-static">${homeVal !== "" ? homeVal : "–"}</span><span class="sep">:</span><span class="score-static">${awayVal !== "" ? awayVal : "–"}</span>`
        : `<input class="score-input" type="number" min="0" max="20" inputmode="numeric" data-match="${m.id}" data-side="home" data-kind="tip" value="${homeVal}" />
           <span class="sep">:</span>
           <input class="score-input" type="number" min="0" max="20" inputmode="numeric" data-match="${m.id}" data-side="away" data-kind="tip" value="${awayVal}" />`;
      const extra = this._renderMatchExtra(m, ctx, results, { compact });
      return this._renderMatchTeams(m, scoreHtml, extra, status, compact);
    };
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

  _renderMatchAccordions(matches, renderMatchFn, selectedGroups = null) {
    const { groups, rounds } = partitionMatches(matches);
    const groupFilter = selectedGroups ? new Set(selectedGroups) : null;
    let html = "";

    for (const g of ALL_GROUPS) {
      if (groupFilter && !groupFilter.has(g)) continue;
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

  _renderMatchAccordionsByDate(matches, renderMatchFn) {
    const sorted = [...matches].sort(
      (a, b) => new Date(a.kickoff || 0).getTime() - new Date(b.kickoff || 0).getTime()
    );
    const sections = [];
    const index = new Map();
    for (const m of sorted) {
      const id = kickoffDayId(m.kickoff);
      if (!index.has(id)) {
        const section = { id, label: kickoffDayLabel(m.kickoff), list: [] };
        index.set(id, section);
        sections.push(section);
      }
      index.get(id).list.push(m);
    }
    this._defaultDateAccordionId = sections[0]?.id || null;
    return sections
      .map((section) =>
        this._renderAccordion(
          section.id,
          section.label,
          section.list.length,
          section.list.map(renderMatchFn).join("")
        )
      )
      .join("");
  }

  _renderMatchAccordionsByTeam(matches, selectedTeams, renderMatchFn) {
    const byTeam = new Map();
    for (const team of selectedTeams) byTeam.set(team, []);
    for (const m of matches) {
      if (selectedTeams.includes(m.home)) byTeam.get(m.home).push(m);
      if (selectedTeams.includes(m.away)) byTeam.get(m.away).push(m);
    }
    for (const list of byTeam.values()) {
      list.sort(
        (a, b) =>
          (parseKickoffDate(a.kickoff)?.getTime() ?? 0) - (parseKickoffDate(b.kickoff)?.getTime() ?? 0)
      );
    }
    return selectedTeams
      .map((team) => {
        const list = byTeam.get(team) || [];
        if (!list.length) return "";
        return this._renderAccordion(
          `team-${team}`,
          team,
          list.length,
          list.map(renderMatchFn).join("")
        );
      })
      .join("");
  }

  _renderTipsViewFilter(mode = "group") {
    return `<div class="tips-view-filter" role="tablist" aria-label="Spielansicht">
      <button type="button" class="view-filter-btn${mode === "group" ? " active" : ""}" data-tips-view="group" role="tab" aria-selected="${mode === "group"}">Nach Gruppe</button>
      <button type="button" class="view-filter-btn${mode === "date" ? " active" : ""}" data-tips-view="date" role="tab" aria-selected="${mode === "date"}">Nach Datum</button>
      <button type="button" class="view-filter-btn${mode === "team" ? " active" : ""}" data-tips-view="team" role="tab" aria-selected="${mode === "team"}">Nach Team</button>
    </div>`;
  }

  _renderGroupFilterChips() {
    const selected = new Set(this._selectedTipGroupsList || normalizeGroups(this._config.show_groups));
    return `<div class="group-filter">${ALL_GROUPS.map(
      (g) =>
        `<button type="button" class="group-chip ${selected.has(g) ? "active" : ""}" data-group-chip="${g}">${g}</button>`
    ).join("")}</div>`;
  }

  _renderTeamFilterChips(teams) {
    const selected = new Set(this._selectedTipTeamsList || []);
    return `<div class="team-filter">${teams
      .map(
        (team) =>
          `<button type="button" class="team-chip ${selected.has(team) ? "active" : ""}" data-team-chip="${escapeHtml(team)}">${escapeHtml(team)}</button>`
      )
      .join("")}</div>`;
  }

  _calendarScoreLabel(match, tip, results) {
    const res = results[match.id];
    if (res) return `${res.home}:${res.away}`;
    if (tip && tip.home !== "" && tip.away !== "") return `${tip.home}:${tip.away}`;
    return null;
  }

  _renderCalendar(matches, playerTips, results, playerId, players) {
    if (!players.length) {
      return `<div class="empty">
        <div class="empty-icon">👥</div>
        <h3>Spieler fehlen</h3>
        <p>Mitspieler in den <strong>Karten-Einstellungen</strong> unter „Spielerverwaltung“ hinzufügen.</p>
      </div>`;
    }
    if (!playerId) {
      return `<div class="empty"><div class="empty-icon">👤</div><h3>Tipper wählen</h3><p>Oben einen Spieler auswählen.</p></div>`;
    }
    if (!matches.length) {
      return `<div class="empty"><div class="empty-icon">📅</div><h3>Keine Spiele</h3><p>Keine Spiele im Kalender.</p></div>`;
    }

    const matchesByDayId = new Map();
    for (const match of matches) {
      if (!match.kickoff) continue;
      const id = kickoffDayId(match.kickoff);
      if (!matchesByDayId.has(id)) matchesByDayId.set(id, []);
      matchesByDayId.get(id).push(match);
    }
    for (const dayMatches of matchesByDayId.values()) {
      dayMatches.sort(
        (a, b) =>
          (parseKickoffDate(a.kickoff)?.getTime() ?? 0) - (parseKickoffDate(b.kickoff)?.getTime() ?? 0)
      );
    }

    const view = this._calendarMonth || this._initialCalendarMonth(matches);
    this._calendarMonth = view;
    const monthRange = this._calendarMonthRange(matches);
    const currentKey = monthKey(view.year, view.month);
    const canGoPrev = !monthRange || currentKey > monthRange.minKey;
    const canGoNext = !monthRange || currentKey < monthRange.maxKey;
    const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    });
    const calendarDays = buildCalendarMonth(view.year, view.month, matchesByDayId);
    const tips = playerTips || {};

    const grid = calendarDays
      .map((day) => {
        const pad = day.inMonth ? "" : "-pad";
        const events = day.matches
          .map((match) => {
            const tip = tips[match.id];
            const res = results[match.id];
            const score = this._calendarScoreLabel(match, tip, results);
            const locked = isPastKickoff(match.kickoff, 0);
            const finished = Boolean(res);
            const homeFlag = isBracketPlaceholder(match.home)
              ? `<span class="calendar-event-abbr">H</span>`
              : `<span class="team-flag">${teamFlag(match.home)}</span>`;
            const awayFlag = isBracketPlaceholder(match.away)
              ? `<span class="calendar-event-abbr">A</span>`
              : `<span class="team-flag">${teamFlag(match.away)}</span>`;
            return `<button type="button" class="calendar-event${locked ? " locked" : ""}${finished ? " finished" : ""}" data-calendar-event="${escapeHtml(match.id)}" title="${escapeHtml(match.home)} vs ${escapeHtml(match.away)}">
              <span class="calendar-event-time">${formatKickoffTime(match.kickoff)}</span>
              <span class="calendar-event-teams">
                ${homeFlag}
                <span class="calendar-event-score${score ? " has-value" : " empty"}${finished ? " result" : ""}">${score ?? "–"}</span>
                ${awayFlag}
              </span>
            </button>`;
          })
          .join("");
        return `<div class="calendar-day${day.inMonth ? "" : " outside"}${day.isToday ? " today" : ""}${day.matches.length ? " has-events" : ""}" role="gridcell">
          <span class="calendar-day-num">${day.date.getDate()}</span>
          ${events ? `<div class="calendar-day-events">${events}</div>` : ""}
        </div>`;
      })
      .join("");

    let detailHtml = "";
    if (this._calendarSelectedMatchId) {
      const selected = matches.find((m) => m.id === this._calendarSelectedMatchId);
      if (selected) {
        detailHtml = `<div class="calendar-match-detail">
          <div class="calendar-match-detail-head">
            <strong>Spieldetails</strong>
            <button type="button" class="btn-secondary calendar-close-btn" data-action="calendar-close">Schließen</button>
          </div>
          ${this._createMatchRenderer(playerTips, results, playerId)(selected)}
        </div>`;
      }
    }

    return `<section class="calendar-panel">
      <h2>Spielkalender</h2>
      <p class="calendar-panel-hint">Alle Anstoßzeiten in MESZ. Auf ein Spiel tippen für Details und Tippeingabe.</p>
      <div class="calendar-month">
        <header class="calendar-month-header">
          <button type="button" class="calendar-nav-btn" data-calendar-nav="prev" aria-label="Vorheriger Monat"${canGoPrev ? "" : " disabled"}>‹</button>
          <h3 class="calendar-month-title">${escapeHtml(monthLabel)}</h3>
          <button type="button" class="calendar-nav-btn" data-calendar-nav="next" aria-label="Nächster Monat"${canGoNext ? "" : " disabled"}>›</button>
        </header>
        <div class="calendar-weekdays" aria-hidden="true">
          ${CALENDAR_WEEKDAYS.map((label) => `<span class="calendar-weekday">${label}</span>`).join("")}
        </div>
        <div class="calendar-grid" role="grid" aria-label="Spielkalender ${escapeHtml(monthLabel)}">${grid}</div>
      </div>
      ${detailHtml}
    </section>`;
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

  _serviceErrorMessage(err) {
    if (!err) return "Unbekannter Fehler";
    if (typeof err === "string") return err;
    return String(err.message || err.body?.message || err.error?.message || err.code || err);
  }

  _extractServiceResponseBody(response) {
    if (!response || typeof response !== "object") return response;
    if (response.response != null) return response.response;
    if (response.result?.response != null) return response.result.response;
    return response;
  }

  async _callClearTipService(payload) {
    const data = { ...payload };
    const entryId = this._entryId();
    if (entryId && data.entry_id == null) data.entry_id = entryId;
    try {
      await this._hass.callService("wm_tippspiel", "clear_tip", data);
      return;
    } catch (err) {
      const msg = this._serviceErrorMessage(err);
      if (!msg.includes("return_response")) throw err;
    }
    const response = await this._hass.callService(
      "wm_tippspiel",
      "clear_tip",
      data,
      {},
      true,
      true
    );
    const body = this._extractServiceResponseBody(response);
    if (body?.deleted === false) {
      throw new Error("Kein gespeicherter Tipp auf dem Server.");
    }
  }

  _styles() {
    const accent = this._accent();
    const accentDark = DEFAULT_ACCENT_DARK;
    return `
      :host {
        display: block;
        width: 100%;
        --wm-bg: #0f1419;
        --wm-bg-card: #1a2332;
        --wm-bg-elevated: #243044;
        --wm-border: #2d3f56;
        --wm-text: #e8edf4;
        --wm-text-muted: #8b9cb3;
        --wm-accent: ${accent};
        --wm-accent-dark: ${accentDark};
        --wm-accent-2: ${DEFAULT_ACCENT_2};
        --wm-danger: #ef4444;
        --wm-radius: 12px;
        --wm-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: var(--wm-text);
        line-height: 1.5;
      }
      * { box-sizing: border-box; }
      ha-card {
        overflow: hidden;
        width: 100%;
        max-width: none;
        border-radius: var(--wm-radius);
        border: 1px solid var(--wm-border);
        background:
          radial-gradient(ellipse at top, #1a2a3a 0%, transparent 55%),
          var(--wm-bg);
        box-shadow: var(--wm-shadow);
        color: var(--wm-text);
      }
      .card-wrap.app-shell {
        position: relative;
        padding: 16px 20px calc(36px + env(safe-area-inset-bottom, 0));
      }
      .app-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .header-brand {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }
      .header-trophy {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: 10px;
        background: rgba(135, 184, 224, 0.12);
        border: 1px solid rgba(135, 184, 224, 0.25);
        color: var(--wm-accent);
      }
      .header-trophy ha-icon {
        --mdc-icon-size: 28px;
      }
      .header-brand h1 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.2;
        color: var(--wm-text);
      }
      .header-brand p {
        margin: 2px 0 0;
        font-size: 0.9rem;
        color: var(--wm-text-muted);
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .badge-admin {
        background: rgba(135, 184, 224, 0.15);
        color: var(--wm-accent);
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        white-space: nowrap;
      }
      .player-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }
      .player-chip {
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
        color: var(--wm-text-muted);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .player-chip:hover {
        background: var(--wm-bg-elevated);
        color: var(--wm-text);
      }
      .player-chip.active {
        background: var(--wm-accent);
        color: #0f1419;
        border-color: var(--wm-accent);
      }
      .tabs.tab-bar {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--wm-border);
        padding: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .tabs.tab-bar::-webkit-scrollbar { display: none; }
      .tab {
        flex: 0 0 auto;
        border: none;
        background: transparent;
        color: var(--wm-text-muted);
        border-radius: 0;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        padding: 10px 16px;
        min-height: 44px;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        opacity: 1;
        transition: color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .tab ha-icon { --mdc-icon-size: 18px; opacity: 0.9; }
      .tab.active {
        color: var(--wm-accent);
        border-bottom-color: var(--wm-accent);
      }
      .body.app-main {
        padding: 0;
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
      .match,
      .match-card {
        background: var(--wm-bg-card);
        border: 1px solid var(--wm-border);
        border-radius: var(--wm-radius);
        padding: 16px;
        margin-bottom: 12px;
        transition: box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .match.tip-status-saved {
        border-left: 3px solid #22c55e;
      }
      .match.tip-status-soon {
        border-left: 3px solid #eab308;
      }
      .match.tip-status-locked {
        border-left: 3px solid #94a3b8;
        opacity: 0.72;
      }
      .match.tip-status-exact {
        border-color: var(--wm-accent-2);
        box-shadow: 0 0 0 1px var(--wm-accent-2), 0 0 12px rgba(34, 197, 94, 0.2);
      }
      .match.compact {
        padding: 8px 10px;
        margin-bottom: 6px;
        border-radius: 10px;
      }
      .match-row-compact {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }
      .match-row-compact .teams-inline {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 6px;
        width: 100%;
        min-width: 0;
        font-size: 0.78rem;
        font-weight: 700;
      }
      .match-row-compact .team-side {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        overflow: hidden;
      }
      .match-row-compact .team-side.home {
        justify-content: flex-end;
      }
      .match-row-compact .team-side.away {
        justify-content: flex-start;
      }
      .match-row-compact .team-side.home .team-name-cell {
        text-align: right;
      }
      .match-row-compact .team-side.away .team-name-cell {
        text-align: left;
      }
      .match-row-compact .team-name-cell {
        min-width: 0;
        overflow: hidden;
      }
      .match-row-compact .team-label,
      .match-row-compact .team-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.2;
      }
      .match-row-compact .team-flag {
        flex-shrink: 0;
      }
      .match-row-compact .team-flag-img {
        width: 22px;
        height: 15px;
      }
      .match-row-compact .score-box {
        flex-shrink: 0;
        padding: 2px 6px;
        gap: 4px;
      }
      .match-row-compact .match-extra {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 4px;
      }
      .match-row-compact .score-input {
        width: 30px;
        height: 30px;
        font-size: 0.82rem;
      }
      .match-row-compact .score-static {
        min-width: 18px;
        text-align: center;
        font-weight: 800;
      }
      .match-row-compact .match-kickoff {
        text-align: center;
        font-size: 0.68rem;
        font-weight: 600;
        opacity: 0.62;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
      .match-row-compact .match-status-badge {
        font-size: 0.62rem;
        padding: 3px 8px;
        border-radius: 999px;
        white-space: nowrap;
        font-weight: 700;
      }
      .match-status-badge.status-saved { display: none; }
      .tips-view-filter {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 14px;
      }
      .view-filter-btn {
        border: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
        color: var(--wm-text-muted);
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .view-filter-btn:hover {
        background: var(--wm-bg-elevated);
        color: var(--wm-text);
      }
      .view-filter-btn.active {
        background: var(--wm-accent);
        color: #0f1419;
        border-color: var(--wm-accent);
      }
      .match-status-badge.status-soon { background: rgba(234,179,8,0.18); color: #fde047; }
      .match-status-badge.status-locked { background: rgba(148,163,184,0.15); color: #cbd5e1; }
      .match-status-badge.status-exact { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.35); }
      .team-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bracket-label .team-label {
        display: block;
        max-width: 100%;
      }
      .group-tables {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }
      .group-table {
        border-radius: var(--wm-radius);
        border: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
        overflow: hidden;
        font-size: 0.68rem;
      }
      .group-table-head {
        padding: 6px 8px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        background: var(--wm-bg-elevated);
        border-bottom: 1px solid var(--wm-border);
        color: var(--wm-accent);
      }
      .group-table-row {
        display: grid;
        grid-template-columns: 14px 28px repeat(4, 18px);
        gap: 4px;
        padding: 4px 6px;
        align-items: center;
      }
      .group-table-row.head {
        opacity: 0.5;
        font-weight: 700;
        font-size: 0.58rem;
        text-transform: uppercase;
      }
      .group-table-row .pos { opacity: 0.65; font-weight: 700; }
      .group-table-row .team-cell {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .group-table-row .team-cell .team-flag-img {
        width: 22px;
        height: 15px;
      }
      .group-table-row .team-cell .team-flag-fallback {
        font-size: 0.95rem;
        line-height: 1;
      }
      .group-table-row .num { text-align: center; font-variant-numeric: tabular-nums; }
      .rank-trend {
        font-size: 0.72rem;
        font-weight: 800;
        margin-left: 4px;
      }
      .rank-trend.up { color: #22c55e; }
      .rank-trend.down { color: #f87171; }
      @keyframes podiumPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.04); }
      }
      @keyframes pointsFlash {
        0%, 100% { background: transparent; }
        50% { background: rgba(135, 184, 224, 0.22); border-radius: 6px; }
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
        background: var(--wm-bg);
        border: 1px solid var(--wm-border);
      }
      .score-input {
        width: 38px;
        height: 38px;
        text-align: center;
        border-radius: 8px;
        border: 1px solid var(--wm-border);
        background: var(--wm-bg);
        color: var(--wm-text);
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
        background: linear-gradient(135deg, var(--wm-accent), var(--wm-accent-dark));
        color: #0f1419;
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
        border-radius: var(--wm-radius);
        border: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
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
        border-top: 1px solid var(--wm-border);
      }
      .standings-panel { min-width: 0; max-width: 100%; }
      .standings-rankings-row {
        display: flex;
        gap: 24px;
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .standings-podium {
        flex-shrink: 0;
        width: min(280px, 100%);
        padding: 16px;
        background: var(--wm-bg-card);
        border: 1px solid var(--wm-border);
        border-radius: var(--wm-radius);
      }
      .standings-podium-title {
        margin: 0 0 16px;
        font-size: 0.95rem;
        color: var(--wm-accent);
        text-align: center;
      }
      .standings-podium-stage {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 8px;
        min-height: 200px;
      }
      .podium-slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        max-width: 88px;
      }
      .podium-slot.flash .podium-block {
        animation: podiumPulse 300ms ease;
      }
      .podium-player {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        margin-bottom: 8px;
        text-align: center;
        min-height: 72px;
        justify-content: flex-end;
      }
      .podium-medal { font-size: 1.35rem; line-height: 1; }
      .podium-name {
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.25;
        word-break: break-word;
      }
      .podium-points {
        font-size: 0.72rem;
        color: var(--wm-text-muted);
        font-weight: 600;
      }
      .podium-block {
        width: 100%;
        display: grid;
        place-items: center;
        border-radius: 8px 8px 0 0;
        color: #86b8e6;
        font-weight: 800;
        font-size: 1.25rem;
      }
      .podium-block-first {
        height: 100px;
        background: linear-gradient(180deg, #f5d547 0%, #c9a227 100%);
        box-shadow: 0 -2px 12px rgba(245, 213, 71, 0.25);
      }
      .podium-block-second {
        height: 72px;
        background: linear-gradient(180deg, #e8e8e8 0%, #a8a8a8 100%);
        box-shadow: 0 -2px 10px rgba(200, 200, 200, 0.15);
      }
      .podium-block-third {
        height: 52px;
        background: linear-gradient(180deg, #e8a86b 0%, #b87333 100%);
        box-shadow: 0 -2px 10px rgba(184, 115, 51, 0.2);
      }
      .podium-block-empty { opacity: 0.35; }
      .podium-slot-empty .podium-block { margin-top: 72px; }
      .podium-rank { font-size: 1.25rem; font-weight: 800; }
      .standings-table-wrap {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
      }
      .standings-table {
        width: 100%;
        min-width: 420px;
        border-collapse: collapse;
        background: var(--wm-bg-card);
        border-radius: var(--wm-radius);
        overflow: hidden;
        border: 1px solid var(--wm-border);
      }
      .standings-table th,
      .standings-table td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid var(--wm-border);
        font-size: 0.86rem;
      }
      .standings-table th {
        background: var(--wm-bg-elevated);
        color: var(--wm-text-muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .standings-table td.num,
      .standings-table th.num { text-align: center; }
      .standings-table td.points {
        font-weight: 700;
        color: var(--wm-accent);
      }
      .standings-table tr.flash-points td.points {
        animation: pointsFlash 300ms ease;
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
        transition: box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .bracket-slot.tip-status-saved { border-left: 3px solid #22c55e; }
      .bracket-slot.tip-status-soon { border-left: 3px solid #eab308; }
      .bracket-slot.tip-status-locked { border-left: 3px solid #94a3b8; opacity: 0.72; }
      .bracket-slot.tip-status-exact {
        border-color: var(--wm-accent-2);
        box-shadow: 0 0 0 1px var(--wm-accent-2);
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
      .group-filter {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 20px;
      }
      .group-chip {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        border: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
        color: var(--wm-text-muted);
        cursor: pointer;
        font-weight: 600;
      }
      .group-chip.active {
        background: var(--wm-accent);
        color: #0f1419;
        border-color: var(--wm-accent);
      }
      .team-filter {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 20px;
        max-height: 220px;
        overflow-y: auto;
        padding: 4px 2px;
      }
      .team-chip {
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
        color: var(--wm-text-muted);
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        line-height: 1.3;
      }
      .team-chip.active {
        background: var(--wm-accent);
        color: #0f1419;
        border-color: var(--wm-accent);
      }
      .empty-hint {
        margin: 0 0 16px;
        text-align: center;
        color: var(--wm-text-muted);
        font-size: 0.9rem;
      }
      .calendar-panel h2 {
        margin: 0 0 12px;
        font-size: 1.1rem;
      }
      .calendar-panel-hint {
        margin: 0 0 16px;
        color: var(--wm-text-muted);
        font-size: 0.9rem;
      }
      .calendar-month {
        background: var(--wm-bg-card);
        border: 1px solid var(--wm-border);
        border-radius: var(--wm-radius);
        overflow: hidden;
      }
      .calendar-month-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--wm-border);
      }
      .calendar-month-title {
        margin: 0;
        flex: 1;
        text-align: center;
        font-size: 1.05rem;
        color: var(--wm-accent);
        text-transform: capitalize;
      }
      .calendar-nav-btn {
        width: 36px;
        height: 36px;
        border: 1px solid var(--wm-border);
        border-radius: 8px;
        background: var(--wm-bg-elevated);
        color: var(--wm-text);
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        flex-shrink: 0;
      }
      .calendar-nav-btn:hover:not(:disabled) {
        border-color: var(--wm-accent);
        color: var(--wm-accent);
      }
      .calendar-nav-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .calendar-weekdays {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        border-bottom: 1px solid var(--wm-border);
        background: var(--wm-bg-elevated);
      }
      .calendar-weekday {
        padding: 8px 4px;
        text-align: center;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--wm-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        grid-auto-rows: minmax(96px, auto);
      }
      .calendar-day {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 96px;
        padding: 6px;
        border-right: 1px solid var(--wm-border);
        border-bottom: 1px solid var(--wm-border);
        background: var(--wm-bg-card);
      }
      .calendar-day:nth-child(7n) { border-right: none; }
      .calendar-day.outside {
        background: color-mix(in srgb, var(--wm-bg) 55%, var(--wm-bg-card));
        opacity: 0.72;
      }
      .calendar-day.today .calendar-day-num {
        background: var(--wm-accent);
        color: #0f1419;
      }
      .calendar-day.has-events {
        background: color-mix(in srgb, var(--wm-accent) 4%, var(--wm-bg-card));
      }
      .calendar-day-num {
        align-self: flex-start;
        min-width: 24px;
        height: 24px;
        padding: 0 6px;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 24px;
        text-align: center;
      }
      .calendar-day-events {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1;
        overflow-y: auto;
      }
      .calendar-event {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        padding: 4px 5px;
        border: 1px solid var(--wm-border);
        border-radius: 6px;
        background: var(--wm-bg-elevated);
        cursor: pointer;
        text-align: left;
        color: inherit;
        font: inherit;
      }
      .calendar-event:hover {
        border-color: color-mix(in srgb, var(--wm-accent) 45%, var(--wm-border));
        background: color-mix(in srgb, var(--wm-accent) 8%, var(--wm-bg-elevated));
      }
      .calendar-event-time {
        font-size: 0.65rem;
        font-weight: 700;
        color: var(--wm-accent);
      }
      .calendar-event-teams {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-width: 0;
      }
      .calendar-event-teams .team-flag-img {
        width: 18px;
        height: 13px;
      }
      .calendar-event-score {
        font-size: 0.68rem;
        font-weight: 800;
        color: var(--wm-text-muted);
        min-width: 1.4em;
        text-align: center;
      }
      .calendar-event-score.has-value { color: var(--wm-accent); }
      .calendar-event-score.result { color: var(--wm-accent-2); }
      .calendar-event-abbr {
        font-size: 0.62rem;
        font-weight: 700;
        color: var(--wm-text-muted);
      }
      .calendar-match-detail {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--wm-border);
      }
      .calendar-match-detail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .calendar-close-btn {
        width: auto;
        margin-top: 0;
        padding: 6px 12px;
        font-size: 0.78rem;
      }
      .empty {
        text-align: center;
        padding: 28px 16px;
        border-radius: var(--wm-radius);
        background: var(--wm-bg-card);
        border: 1px dashed var(--wm-border);
      }
      .empty-icon { font-size: 2.2rem; margin-bottom: 8px; }
      .empty h3 { margin: 0 0 6px; font-size: 1rem; }
      .empty p { margin: 0; font-size: 0.82rem; opacity: 0.7; line-height: 1.45; }
      .rules {
        margin-top: 16px;
        padding: 10px 12px;
        border-radius: var(--wm-radius);
        font-size: 0.78rem;
        color: var(--wm-text-muted);
        line-height: 1.45;
        background: var(--wm-bg-card);
        border: 1px solid var(--wm-border);
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
      @media (max-width: 768px) {
        .card-wrap.app-shell { padding: 12px 14px calc(28px + env(safe-area-inset-bottom, 0)); }
        .header-trophy { width: 40px; height: 40px; }
        .header-trophy ha-icon { --mdc-icon-size: 24px; }
        .standings-rankings-row { flex-direction: column; align-items: stretch; }
        .standings-podium { width: 100%; max-width: 360px; margin: 0 auto; }
        .standings-table { min-width: 0; font-size: 0.82rem; }
        .standings-table th,
        .standings-table td { padding: 8px 6px; }
        .calendar-grid { grid-auto-rows: minmax(72px, auto); }
        .calendar-day { min-height: 72px; }
        .team-chip { font-size: 0.78rem; }
        .group-chip { width: 36px; height: 36px; }
        .match-row-compact .teams-inline,
        .match .teams {
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          gap: 4px;
        }
        .match-row-compact .teams-inline {
          font-size: 0.7rem;
        }
        .match-row-compact .team-side.home,
        .match .team:not(.away) {
          justify-content: flex-end;
        }
        .match-row-compact .team-side.away,
        .match .team.away {
          justify-content: flex-start;
          align-items: center;
          text-align: left;
        }
        .match .team {
          flex-direction: row;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        .match .team:not(.away) .team-flag {
          order: 2;
          flex-shrink: 0;
        }
        .match .team:not(.away) .team-name {
          order: 1;
          text-align: right;
        }
        .match .team.away .team-flag {
          order: 1;
          flex-shrink: 0;
        }
        .match .team.away .team-name {
          order: 2;
          text-align: left;
        }
        .match .team-name,
        .match-row-compact .team-label,
        .match-row-compact .team-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .match-row-compact .team-side.home .team-name-cell {
          flex: 1 1 auto;
        }
        .match-row-compact .team-flag-img,
        .match .team-flag-img {
          width: 20px;
          height: 14px;
        }
        .match-row-compact .score-input {
          width: 28px;
          height: 28px;
          font-size: 0.78rem;
        }
        .bracket-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    `;
  }

  _renderShell() {
    if (!this.shadowRoot) return;
    if (this._tab === "matches") this._tab = "bracket";
    if (this._tab === "players") this._tab = "tips";
    const captureId = this._displayedPlayerId ?? this._selectedPlayer;
    if ((this._tab === "tips" || this._tab === "bracket" || this._tab === "calendar") && captureId) {
      this._captureDraftInputsFromDom(captureId);
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
      const { players, matches, standings, tips, results, group_tables: groupTables } = this._data();
      const groupMatches = this._groupStageMatches(matches);
      const knockoutMatches = this._knockoutMatches(matches);
      const playerId = this._selectedPlayer;
      const playerTips = tips[playerId] || {};

      if (this._tab === "bracket" && this._config.show_knockout === false) this._tab = "tips";

      if (this._tab === "standings") {
        this._detectStandingsFlash(standings);
        body = this._renderStandings(standings);
      } else if (this._tab === "calendar") {
        body = this._renderCalendar(this._filteredMatches(matches), playerTips, results, playerId, players);
      } else if (this._tab === "bracket") body = this._renderBracket(knockoutMatches, playerTips, results, playerId, players);
      else body = this._renderTips(groupMatches, playerTips, results, playerId, players, groupTables);
    }

    const subtitle = cfg.subtitle || "Fußball-WM 2026 · Tipprunde";
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-wrap app-shell">
          <header class="app-header">
            <div class="header-brand">
              <span class="header-trophy" aria-hidden="true"><ha-icon icon="mdi:trophy"></ha-icon></span>
              <div>
                <h1>${escapeHtml(cfg.title || "WM Tippspiel")}</h1>
                <p>${escapeHtml(subtitle)}</p>
              </div>
            </div>
            <div class="header-actions">
              ${this._isAdmin() ? `<span class="badge-admin">Admin</span>` : ""}
            </div>
          </header>
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
          <nav class="tabs tab-bar" aria-label="Bereiche">
            ${this._visibleTabs()
              .map(
                (t) =>
                  `<button type="button" class="tab ${this._tab === t.id ? "active" : ""}" data-tab="${t.id}">
                  <ha-icon icon="${t.icon}"></ha-icon>
                  <span>${t.label}</span>
                </button>`
              )
              .join("")}
          </nav>
          <main class="body app-main" data-match-cols="${this._matchColumns()}">${body}</main>
          ${cfg.show_rules !== false ? `<div class="rules">⚽ 3 Punkte exakt · 1 Punkt richtige Tendenz</div>` : ""}
          <div class="version-badge">v${WM_TIPPSPIEL_CARD_VERSION}</div>
        </div>
      </ha-card>
    `;

    if (this._tab === "tips" || this._tab === "bracket" || this._tab === "calendar") {
      this.shadowRoot.querySelectorAll("[data-action=save-tip]").forEach((btn) => {
        this._syncTipSaveButton(btn.getAttribute("data-match"));
      });
    }
    if (this._selectedPlayer) {
      this._displayedPlayerId = this._selectedPlayer;
      this._snapshotPlayerTips(this._selectedPlayer);
    }
  }

  _isAdmin() {
    return this._config.admin === true || this._config.admin === "true";
  }

  _detectStandingsFlash(standings) {
    const prev = this._prevStandingsMap || {};
    const flash = new Set();
    const podiumFlash = new Set();
    for (const s of standings) {
      if (prev[s.id] != null && prev[s.id] !== s.points) flash.add(s.id);
    }
    const top3 = standings.slice(0, 3).map((s) => s.id);
    const prevTop3 = this._prevTop3Ids || [];
    for (const id of top3) {
      if (prevTop3.length && !prevTop3.includes(id)) podiumFlash.add(id);
    }
    this._prevStandingsMap = Object.fromEntries(standings.map((s) => [s.id, s.points]));
    this._prevTop3Ids = top3;
    this._standingsFlashIds = flash;
    this._podiumFlashIds = podiumFlash;
    if (flash.size || podiumFlash.size) {
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        this._standingsFlashIds = new Set();
        this._podiumFlashIds = new Set();
        if (this._tab === "standings") this._renderShell();
      }, 320);
    }
  }

  _renderRankTrend(change) {
    const n = Number(change) || 0;
    if (n > 0) return `<span class="rank-trend up" title="Platz verbessert">↑${n}</span>`;
    if (n < 0) return `<span class="rank-trend down" title="Platz verschlechtert">↓${Math.abs(n)}</span>`;
    return "";
  }

  _renderGroupTables(groupTables) {
    const groups = normalizeGroups(this._config.show_groups).filter((g) => (groupTables[g] || []).length);
    if (!groups.length) return "";
    return `<div class="group-tables">${groups
      .map((g) => {
        const rows = groupTables[g] || [];
        const body = rows
          .map((row, i) => {
            return `<div class="group-table-row">
              <span class="pos">${i + 1}</span>
              <span class="team-cell" title="${escapeHtml(row.team)}">${teamFlag(row.team)}</span>
              <span class="num">${row.played}</span>
              <span class="num">${row.points}</span>
              <span class="num">${row.gf}</span>
              <span class="num">${row.gf - row.ga}</span>
            </div>`;
          })
          .join("");
        return `<div class="group-table">
          <div class="group-table-head">Gruppe ${g}</div>
          <div class="group-table-row head"><span>#</span><span></span><span>Sp</span><span>Pkt</span><span>T</span><span>+/-</span></div>
          ${body}
        </div>`;
      })
      .join("")}</div>`;
  }

  _buildMatchTipContext(m, playerTips, results, playerId) {
    const locked = isPastKickoff(m.kickoff, 0);
    const savedTip = this._getStoredTipFromMap(playerTips, m.id) || {};
    const draftTip = this._getDraftTip(playerId, m.id);
    const tip = mergeTipWithDraft(savedTip, draftTip);
    const res = results[m.id];
    const homeVal = tip.home ?? "";
    const awayVal = tip.away ?? "";
    const pts = this._tipPoints(tip.home != null && tip.away != null && tip.home !== "" && tip.away !== "" ? tip : null, res);
    const status = matchTipStatus(m, tip, res);
    return { locked, tip, res, homeVal, awayVal, pts, status };
  }

  _renderMatchExtra(m, ctx, results, { compact = false } = {}) {
    const { locked, tip, res, homeVal, awayVal, pts, status } = ctx;
    let extra = "";
    if (!compact && res) extra += `<span class="badge badge-result">Ergebnis ${res.home}:${res.away}</span>`;
    if (pts != null && tip.home !== "" && tip.away !== "") {
      extra += `<span class="badge badge-points">+${pts} Punkte</span>`;
    }
    if (!locked) {
      if (this._autoSaveEnabled()) {
        const saveStatus = this._tipSaveStatus[m.id] || "";
        extra += `<span class="badge tip-status${saveStatus ? ` tip-status-${saveStatus}` : ""}" data-match="${m.id}">${
          saveStatus === "pending"
            ? "…"
            : saveStatus === "saving"
              ? "Speichern…"
              : saveStatus === "saved"
                ? compact ? "✓" : "Gespeichert ✓"
                : saveStatus === "error"
                  ? "Fehler"
                  : ""
        }</span>`;
      } else if (!compact) {
        const canSave = this._tipInputsValid(m.id) || (homeVal !== "" && awayVal !== "");
        extra += `<button type="button" class="btn" data-action="save-tip" data-match="${m.id}"${canSave ? "" : " disabled"}>Tipp speichern</button>`;
      }
    } else if (!compact) {
      extra += `<span class="badge badge-locked">🔒 Tippabgabe geschlossen</span>`;
    }
    if (this._isAdmin()) {
      extra += this._renderAdminResultControls(m, results);
    }
    if (compact) {
      const label = tipStatusLabel(status);
      extra += `<span class="match-status-badge status-${status}"${label ? "" : ' style="display:none"'}">${label || ""}</span>`;
    }
    return extra;
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
      { player: top3[1], placement: "second", medal: "🥈" },
      { player: top3[0], placement: "first", medal: "🥇" },
      { player: top3[2], placement: "third", medal: "🥉" },
    ];
    const podiumFlash = this._podiumFlashIds || new Set();
    const placementRank = { first: 1, second: 2, third: 3 };
    const podiumStage = podiumSlots
      .map(({ player: s, placement, medal }) => {
        const flash = s && podiumFlash.has(s.id) ? " flash" : "";
        const blockClass = `podium-block-${placement}`;
        const rank = placementRank[placement];
        return `<div class="podium-slot${s ? "" : " podium-slot-empty"}${flash}">
          <div class="podium-player">
            <span class="podium-medal">${s ? medal : ""}</span>
            <span class="podium-name">${s ? escapeHtml(s.name) : "—"}</span>
            <span class="podium-points">${s ? `${s.points} Pkt.` : ""}</span>
          </div>
          <div class="podium-block ${blockClass}${s ? "" : " podium-block-empty"}"><span class="podium-rank">${rank}</span></div>
        </div>`;
      })
      .join("");

    const flashIds = this._standingsFlashIds || new Set();
    const rows = standings
      .map((s, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : s.rank;
        const flash = flashIds.has(s.id) ? " flash-points" : "";
        return `<tr${flash ? ` class="${flash.trim()}"` : ""}>
          <td class="num">${medal}</td>
          <td>${escapeHtml(s.name)}${this._renderRankTrend(s.rank_change)}</td>
          <td class="num points">${s.points}</td>
          <td class="num">${s.exact}</td>
          <td class="num">${s.tendency}</td>
        </tr>`;
      })
      .join("");

    return `<section class="standings-panel">
      <div class="standings-rankings-row">
        <div class="standings-podium">
          <h2 class="standings-podium-title">Top 3</h2>
          <div class="standings-podium-stage">${podiumStage}</div>
        </div>
        <div class="standings-table-wrap">
          <table class="standings-table">
            <thead>
              <tr>
                <th class="num">#</th>
                <th>Spieler</th>
                <th class="num">Pkt</th>
                <th class="num">Exakt</th>
                <th class="num">Tendenz</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </section>`;
  }

  _renderMatchTeams(m, scoreHtml, extra = "", status = "pending", compact = false) {
    const statusClass = status ? ` tip-status-${status}` : "";
    if (compact) {
      return `<div class="match match-card compact${statusClass}" data-match-id="${m.id}">
        <div class="match-row-compact">
          <div class="teams-inline">
            <div class="team-side home">
              <span class="team-name-cell">${teamDisplayName(m.home)}</span>
              <span class="team-flag">${teamFlag(m.home)}</span>
            </div>
            <div class="score-box">${scoreHtml}</div>
            <div class="team-side away">
              <span class="team-flag">${teamFlag(m.away)}</span>
              <span class="team-name-cell">${teamDisplayName(m.away)}</span>
            </div>
          </div>
          <div class="match-kickoff">${formatKickoff(m.kickoff)}</div>
          ${extra ? `<div class="match-extra">${extra}</div>` : ""}
        </div>
      </div>`;
    }
    return `<div class="match match-card${statusClass}" data-match-id="${m.id}">
      <div class="match-meta">
        <span>${formatKickoff(m.kickoff)}</span>
        <span>${escapeHtml(m.venue || m.stage || "")}</span>
      </div>
      <div class="teams">
        <div class="team">
          <span class="team-flag">${teamFlag(m.home)}</span>
          <span class="team-name">${teamDisplayName(m.home)}</span>
        </div>
        <div class="score-box">${scoreHtml}</div>
        <div class="team away">
          <span class="team-flag">${teamFlag(m.away)}</span>
          <span class="team-name">${teamDisplayName(m.away)}</span>
        </div>
      </div>
      ${extra}
    </div>`;
  }

  _renderBracketMatchSlot(m, playerTips, results, playerId, options = {}) {
    const ctx = this._buildMatchTipContext(m, playerTips, results, playerId);
    const { locked, homeVal, awayVal, pts, tip, res, status } = ctx;
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
        const saveStatus = this._tipSaveStatus[m.id] || "";
        if (saveStatus) {
          footer += `<span class="badge tip-status tip-status-${saveStatus}" data-match="${m.id}">${
            saveStatus === "pending"
              ? "…"
              : saveStatus === "saving"
                ? "Speichern…"
                : saveStatus === "saved"
                  ? "✓"
                  : saveStatus === "error"
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

    return `<div class="bracket-slot tip-status-${status}${centerClass}" data-match-id="${m.id}">
      <div class="bracket-slot-head">
        <span class="bracket-id">${escapeHtml(m.id)}</span>
        <span>${escapeHtml(m.stage || "")}</span>
      </div>
      <div class="bracket-team-line">
        ${isBracketPlaceholder(m.home) ? "" : `<span class="team-flag">${teamFlag(m.home)}</span>`}
        <span class="bracket-label" title="${escapeHtml(m.home)}">${teamDisplayName(m.home)}</span>
        ${homeScore}
      </div>
      <div class="bracket-team-line">
        ${isBracketPlaceholder(m.away) ? "" : `<span class="team-flag">${teamFlag(m.away)}</span>`}
        <span class="bracket-label" title="${escapeHtml(m.away)}">${teamDisplayName(m.away)}</span>
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
        <p>Mitspieler in den <strong>Karten-Einstellungen</strong> unter „Spielerverwaltung“ hinzufügen.</p>
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

  _renderTips(matches, playerTips, results, playerId, players, groupTables = {}) {
    if (!players.length) {
      return `<div class="empty">
        <div class="empty-icon">👥</div>
        <h3>Spieler fehlen</h3>
        <p>Mitspieler in den <strong>Karten-Einstellungen</strong> unter „Spielerverwaltung“ hinzufügen.</p>
      </div>`;
    }
    if (!playerId) {
      return `<div class="empty"><div class="empty-icon">👤</div><h3>Tipper wählen</h3><p>Oben einen Spieler auswählen.</p></div>`;
    }
    if (!matches.length) {
      return `<div class="empty"><div class="empty-icon">⚽</div><h3>Keine Spiele</h3><p>Gruppenfilter in den Einstellungen anpassen.</p></div>`;
    }

    const tablesHtml =
      this._config.show_group_tables !== false ? this._renderGroupTables(groupTables) : "";
    const renderMatchFn = this._createMatchRenderer(playerTips, results, playerId);
    const viewMode =
      this._tipsViewMode === "date" ? "date" : this._tipsViewMode === "team" ? "team" : "group";
    const filterHtml = this._renderTipsViewFilter(viewMode);

    let chipsHtml = "";
    let accordions = "";
    if (viewMode === "group") {
      chipsHtml = this._renderGroupFilterChips();
      const selectedGroups = this._selectedTipGroupsList || normalizeGroups(this._config.show_groups);
      const filtered = matches.filter((m) =>
        selectedGroups.includes(String(m.group || "").toUpperCase())
      );
      accordions = filtered.length
        ? this._renderMatchAccordions(filtered, renderMatchFn, selectedGroups)
        : `<p class="empty-hint">Keine Spiele für die aktuelle Auswahl.</p>`;
    } else if (viewMode === "date") {
      accordions = this._renderMatchAccordionsByDate(matches, renderMatchFn);
    } else {
      const teams = this._groupStageTeams(matches);
      chipsHtml = this._renderTeamFilterChips(teams);
      const selectedTeams = this._selectedTipTeamsList || [];
      accordions = selectedTeams.length
        ? this._renderMatchAccordionsByTeam(matches, selectedTeams, renderMatchFn)
        : `<p class="empty-hint">Wähle ein oder mehrere Teams aus.</p>`;
    }

    return `${tablesHtml}${filterHtml}${chipsHtml}${accordions}`;
  }

  async _saveTip(matchId, options = {}) {
    const btn = options.btn || null;
    const silent = Boolean(options.silent);
    const playerId = options.playerId ?? this._selectedPlayer;
    if (!playerId) {
      if (!silent) this._showToast("Bitte zuerst einen Spieler auswählen.", "error");
      return;
    }
    if (!matchId) return;

    const match = (this._state?.attributes?.matches || []).find((m) => m.id === matchId);
    if (match && isPastKickoff(match.kickoff, 0)) {
      if (!silent) this._showToast("Tippabgabe geschlossen – Anpfiff bereits erfolgt.", "error");
      return;
    }

    this._clearAutoSaveTimer(matchId);

    const { home, away } = this._readTipFieldValues(matchId, playerId);
    if (home === "" || away === "" || Number.isNaN(Number(home)) || Number.isNaN(Number(away))) {
      if (!silent) this._showToast("Bitte beide Tore eingeben.", "error");
      return;
    }

    const homeNum = Number(home);
    const awayNum = Number(away);
    const saved = this._getSavedTip(matchId, playerId);
    if (saved && saved.home === homeNum && saved.away === awayNum) {
      delete this._draftTipsForPlayer(playerId)[matchId];
      this._clearTipDirty(playerId, matchId);
      if (playerId === this._selectedPlayer) {
        this._setTipSaveStatus(matchId, "saved");
        this._syncMatchTipVisuals(matchId);
      }
      return;
    }

    if (playerId === this._selectedPlayer) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Speichern…";
      } else {
        this._setTipSaveStatus(matchId, "saving");
      }
    }

    try {
      await this._callService("set_tip", {
        player_id: playerId,
        match_id: matchId,
        home: homeNum,
        away: awayNum,
      });
      this._applySavedTip(matchId, homeNum, awayNum, playerId);
      const playerDrafts = this._draftTipsForPlayer(playerId);
      delete playerDrafts[matchId];
      this._clearTipDirty(playerId, matchId);
      if (playerId === this._selectedPlayer) {
        this._setTipSaveStatus(matchId, "saved");
        this._syncMatchTipVisuals(matchId);
        if (!silent) {
          this._renderShell();
          this._showToast("Tipp gespeichert ✓", "success");
        }
      }
    } catch (err) {
      console.error("[wm-tippspiel-card] set_tip failed:", err);
      if (playerId === this._selectedPlayer) {
        this._setTipSaveStatus(matchId, "error");
        if (!silent) this._showToast(`Speichern fehlgeschlagen: ${err?.message || err}`, "error");
      }
    } finally {
      if (btn && playerId === this._selectedPlayer) {
        btn.disabled = false;
        btn.textContent = "Tipp speichern";
      }
    }
  }

  async _clearTip(matchId, options = {}) {
    const silent = Boolean(options.silent);
    const playerId = options.playerId ?? this._selectedPlayer;
    if (!playerId) {
      if (!silent) this._showToast("Bitte zuerst einen Spieler auswählen.", "error");
      return;
    }
    if (!matchId) return;

    const match = (this._state?.attributes?.matches || []).find((m) => m.id === matchId);
    if (match && isPastKickoff(match.kickoff, 0)) {
      if (!silent) this._showToast("Tippabgabe geschlossen – Anpfiff bereits erfolgt.", "error");
      return;
    }

    if (!options.force && !this._shouldClearTip(matchId, playerId)) {
      if (this._tipInputsEmpty(matchId, playerId)) {
        this._discardTipDraft(matchId, playerId);
      } else if (playerId === this._selectedPlayer) {
        this._syncMatchTipVisuals(matchId);
        this._resetTipSaveBadge(matchId);
      }
      return;
    }

    const hadStored = this._hasStoredTipForClear(matchId, playerId);
    if (!hadStored) {
      if (this._tipInputsEmpty(matchId, playerId)) {
        this._discardTipDraft(matchId, playerId);
      }
      return;
    }

    if (playerId === this._selectedPlayer) {
      this._setTipSaveStatus(matchId, "saving");
    }
    try {
      await this._callClearTipService({
        player_id: playerId,
        match_id: matchId,
      });
      this._applyClearedTip(matchId, playerId);
      const playerDrafts = this._draftTipsForPlayer(playerId);
      delete playerDrafts[matchId];
      this._clearTipDirty(playerId, matchId);
      if (playerId === this._selectedPlayer) {
        this._resetTipSaveBadge(matchId);
        this._syncMatchTipVisuals(matchId);
        if (!silent) {
          this._renderShell();
          this._showToast("Tipp entfernt", "success");
        }
      }
    } catch (err) {
      const msg = this._serviceErrorMessage(err);
      console.warn("[wm-tippspiel-card] clear_tip failed:", msg, {
        matchId,
        playerId,
        err,
      });
      if (playerId === this._selectedPlayer) {
        this._setTipSaveStatus(matchId, "error");
      }
      const hint = msg.includes("clear_tip") || msg.includes("not found") || msg.includes("Service")
        ? " Home Assistant neu laden (Integration-Update)."
        : "";
      this._showToast(`Tipp konnte nicht gelöscht werden: ${msg}${hint}`, "error");
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
