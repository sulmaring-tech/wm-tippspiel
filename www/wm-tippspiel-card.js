const WM_TIPPSPIEL_CARD_VERSION = "1.2.1";

const ALL_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const DEFAULT_ACCENT = "#fbbf24";
const DEFAULT_ACCENT_2 = "#22c55e";
const FLAG_CDN = "https://flagcdn.com/w40";

const TABS = [
  { id: "tips", label: "Tippen", icon: "mdi:soccer" },
  { id: "matches", label: "Spiele", icon: "mdi:calendar-clock" },
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
  "UEFA-Playoff A": "eu",
  "UEFA-Playoff B": "eu",
  "UEFA-Playoff C": "eu",
  "UEFA-Playoff D": "eu",
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

function defaultConfig(overrides = {}) {
  return {
    type: "custom:wm-tippspiel-card",
    entity: "",
    title: "WM Tippspiel 2026",
    subtitle: "",
    player_id: "",
    admin: false,
    show_groups: [...ALL_GROUPS],
    show_rules: true,
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

  _render() {
    const cfg = this._config;
    const players = this._players();

    this.innerHTML = `
      <div class="ed">
        <div class="ed-section">
          <div class="ed-title">Allgemein</div>
          <ha-entity-picker
            .hass=${this._hass}
            .value=${cfg.entity || ""}
            .includeDomains=${["sensor"]}
            label="Ranglisten-Sensor"
            allow-custom-entity
          ></ha-entity-picker>
          <ha-textfield
            label="Titel"
            .value=${cfg.title || ""}
            data-key="title"
          ></ha-textfield>
          <ha-textfield
            label="Untertitel (optional)"
            .value=${cfg.subtitle || ""}
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
              .value=${this._newPlayerName || ""}
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
          <ha-formfield label="Admin-Modus (Ergebnisse eintragen)">
            <ha-switch .checked=${Boolean(cfg.admin)} data-key="admin"></ha-switch>
          </ha-formfield>
          <ha-formfield label="Punkteregeln unten anzeigen">
            <ha-switch .checked=${cfg.show_rules !== false} data-key="show_rules"></ha-switch>
          </ha-formfield>
        </div>

        <div class="ed-section">
          <div class="ed-title">Design</div>
          <ha-textfield
            label="Akzentfarbe (Hex)"
            .value=${cfg.accent_color || DEFAULT_ACCENT}
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
        ha-entity-picker, ha-textfield, ha-formfield {
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

    this.querySelector("ha-entity-picker")?.addEventListener("value-changed", (ev) => {
      this._set("entity", ev.detail.value);
    });

    this.querySelectorAll("ha-textfield[data-key]").forEach((el) => {
      el.addEventListener("change", (ev) => {
        const key = el.getAttribute("data-key");
        if (key === "new_player") {
          this._newPlayerName = ev.target.value;
          return;
        }
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

    this.querySelector("ha-switch[data-key=admin]")?.addEventListener("change", (ev) => {
      this._set("admin", ev.target.checked);
    });

    this.querySelector("ha-switch[data-key=show_rules]")?.addEventListener("change", (ev) => {
      this._set("show_rules", ev.target.checked);
    });
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
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._renderShell();
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass.states[this._config.entity];
    if (!state) {
      this._state = null;
      this._renderShell();
      return;
    }
    this._state = state;
    this._ensurePlayer();
    this._renderShell();
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
    if (this._config.player_id && players.some((p) => p.id === this._config.player_id)) {
      this._selectedPlayer = this._config.player_id;
      return;
    }
    this._selectedPlayer = players[0].id;
  }

  _data() {
    const a = this._state?.attributes || {};
    return {
      standings: a.standings || [],
      players: a.players || [],
      matches: a.matches || [],
      tips: a.tips || {},
      results: a.results || {},
    };
  }

  _filteredMatches(matches) {
    const set = new Set(normalizeGroups(this._config.show_groups));
    return matches.filter((m) => set.has(String(m.group || "").toUpperCase()));
  }

  _accent() {
    return this._config.accent_color || DEFAULT_ACCENT;
  }

  async _callService(service, data) {
    await this._hass.callService("wm_tippspiel", service, data);
  }

  _styles() {
    const accent = this._accent();
    return `
      :host { display: block; }
      * { box-sizing: border-box; }
      ha-card {
        overflow: hidden;
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
      .body { padding: 14px 16px 16px; }
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
      .btn-secondary {
        background: rgba(255,255,255,0.08);
        color: inherit;
        border: 1px solid rgba(255,255,255,0.12);
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
      .player-row-actions { display: flex; gap: 6px; }
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
      const filtered = this._filteredMatches(matches);
      const playerId = this._selectedPlayer;
      const playerTips = tips[playerId] || {};

      if (!players.length && this._tab === "tips") this._tab = "players";

      if (this._tab === "standings") body = this._renderStandings(standings);
      else if (this._tab === "matches") body = this._renderMatchesList(filtered, results);
      else if (this._tab === "players") body = this._renderPlayers(players);
      else body = this._renderTips(filtered, playerTips, results, playerId, players);
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
              ${cfg.admin ? `<span class="badge-admin">Admin</span>` : ""}
            </div>
            ${
              !missing && (this._data().players || []).length
                ? `<div class="player-bar">${this._data()
                    .players.map(
                      (p) =>
                        `<button type="button" class="player-chip ${p.id === this._selectedPlayer ? "active" : ""}" data-player="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`
                    )
                    .join("")}</div>`
                : ""
            }
          </div>
          <div class="tabs">
            ${TABS.map(
              (t) =>
                `<button type="button" class="tab ${this._tab === t.id ? "active" : ""}" data-tab="${t.id}">
                  <ha-icon icon="${t.icon}"></ha-icon>
                  <span>${t.label}</span>
                </button>`
            ).join("")}
          </div>
          <div class="body">${body}</div>
          ${cfg.show_rules !== false ? `<div class="rules">⚽ 3 Punkte exakt · 1 Punkt richtige Tendenz</div>` : ""}
          <div class="version-badge">v${WM_TIPPSPIEL_CARD_VERSION}</div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._tab = btn.getAttribute("data-tab");
        this._renderShell();
      });
    });

    this.shadowRoot.querySelectorAll("[data-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._selectedPlayer = btn.getAttribute("data-player");
        this._renderShell();
      });
    });

    this.shadowRoot.querySelectorAll("[data-action=save-tip]").forEach((btn) => {
      btn.addEventListener("click", () => this._saveTip(btn));
    });

    this.shadowRoot.querySelectorAll("[data-action=save-result]").forEach((btn) => {
      btn.addEventListener("click", () => this._saveResult(btn));
    });

    this.shadowRoot.querySelectorAll(".score-input").forEach((input) => {
      input.addEventListener("input", (ev) => {
        const matchId = ev.target.getAttribute("data-match");
        const side = ev.target.getAttribute("data-side");
        const kind = ev.target.getAttribute("data-kind") || "tip";
        const bucket = kind === "result" ? this._draftResults : this._draftTips;
        bucket[matchId] = bucket[matchId] || {};
        bucket[matchId][side] = ev.target.value;
      });
    });

    this.shadowRoot.querySelector("[data-action=add-player-card]")?.addEventListener("click", () =>
      this._addPlayerFromCard()
    );

    this.shadowRoot.querySelector(".add-player-input")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") this._addPlayerFromCard();
    });

    this.shadowRoot.querySelector(".add-player-input")?.addEventListener("input", (ev) => {
      this._newPlayerName = ev.target.value;
    });

    this.shadowRoot.querySelectorAll("[data-action=select-player-row]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._selectedPlayer = btn.getAttribute("data-player");
        this._tab = "tips";
        this._renderShell();
      });
    });

    this.shadowRoot.querySelectorAll("[data-action=remove-player]").forEach((btn) => {
      btn.addEventListener("click", () => this._removePlayer(btn.getAttribute("data-player")));
    });
  }

  _renderPlayers(players) {
    const list =
      players.length > 0
        ? `<div class="player-list">${players
            .map(
              (p) =>
                `<div class="player-row">
                  <div>
                    <div class="player-row-name">${escapeHtml(p.name)}</div>
                    <div class="player-row-id">ID: ${escapeHtml(p.id)}</div>
                  </div>
                  <div class="player-row-actions">
                    <button type="button" class="btn-icon" data-action="select-player-row" data-player="${escapeHtml(p.id)}">Tippen</button>
                    ${this._config.admin ? `<button type="button" class="btn-icon danger" data-action="remove-player" data-player="${escapeHtml(p.id)}">Entfernen</button>` : ""}
                  </div>
                </div>`
            )
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

  async _removePlayer(playerId) {
    if (!playerId || !this._hass || !this._config.admin) return;
    await this._callService("remove_player", { player_id: playerId });
    if (this._selectedPlayer === playerId) this._selectedPlayer = null;
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
    const medals = ["🥈", "🥇", "🥉"];
    const classes = ["second", "first", "third"];
    const podium =
      top3.length >= 2
        ? `<div class="podium">${top3
            .map((s, i) => {
              const cls = classes[i] || "";
              return `<div class="podium-item ${cls}">
                <div class="podium-rank">${medals[i] || s.rank}</div>
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

  _renderMatchesList(matches, results) {
    if (!matches.length) {
      return `<div class="empty"><div class="empty-icon">📅</div><h3>Keine Spiele</h3><p>Gruppenfilter in den Karten-Einstellungen prüfen.</p></div>`;
    }
    let html = "";
    let lastGroup = "";
    for (const m of matches) {
      if (m.group && m.group !== lastGroup) {
        lastGroup = m.group;
        html += `<div class="group-label">Gruppe ${m.group}</div>`;
      }
      const res = results[m.id];
      const scoreHtml = `<span class="score-static">${res ? res.home : "–"}</span><span class="sep">:</span><span class="score-static">${res ? res.away : "–"}</span>`;
      const extra = res ? `<span class="badge badge-result">✓ Endstand ${res.home}:${res.away}</span>` : "";
      html += this._renderMatchTeams(m, scoreHtml, extra);
    }
    return html;
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

    let html = "";
    let lastGroup = "";
    for (const m of matches) {
      if (m.group && m.group !== lastGroup) {
        lastGroup = m.group;
        html += `<div class="group-label">Gruppe ${m.group}</div>`;
      }
      const locked = isPastKickoff(m.kickoff) && !this._config.admin;
      const tip = this._draftTips[m.id] || playerTips[m.id] || {};
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
      if (!locked && homeVal !== "" && awayVal !== "") {
        extra += `<button type="button" class="btn" data-action="save-tip" data-match="${m.id}">Tipp speichern</button>`;
      } else if (locked) {
        extra += `<span class="badge badge-locked">🔒 Tippabgabe geschlossen</span>`;
      }

      if (this._config.admin) {
        extra += `<div class="admin-row">
          <span class="admin-label">Ergebnis eintragen</span>
          <input class="score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="home" data-kind="result" value="${(this._draftResults[m.id] || res || {}).home ?? ""}" placeholder="0" />
          <span class="sep">:</span>
          <input class="score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="away" data-kind="result" value="${(this._draftResults[m.id] || res || {}).away ?? ""}" placeholder="0" />
          <button type="button" class="btn btn-secondary" data-action="save-result" data-match="${m.id}">Speichern</button>
        </div>`;
      }

      html += this._renderMatchTeams(m, scoreHtml, extra);
    }
    return html;
  }

  async _saveTip(btn) {
    const matchId = btn.getAttribute("data-match");
    const inputs = this.shadowRoot.querySelectorAll(`.score-input[data-match="${matchId}"][data-kind="tip"]`);
    let home;
    let away;
    inputs.forEach((inp) => {
      if (inp.getAttribute("data-side") === "home") home = inp.value;
      if (inp.getAttribute("data-side") === "away") away = inp.value;
    });
    if (home === "" || away === "") return;
    btn.disabled = true;
    try {
      await this._callService("set_tip", {
        player_id: this._selectedPlayer,
        match_id: matchId,
        home: Number(home),
        away: Number(away),
      });
      delete this._draftTips[matchId];
    } finally {
      btn.disabled = false;
    }
  }

  async _saveResult(btn) {
    const matchId = btn.getAttribute("data-match");
    const inputs = this.shadowRoot.querySelectorAll(`.score-input[data-match="${matchId}"][data-kind="result"]`);
    let home;
    let away;
    inputs.forEach((inp) => {
      if (inp.getAttribute("data-side") === "home") home = inp.value;
      if (inp.getAttribute("data-side") === "away") away = inp.value;
    });
    if (home === "" || away === "") return;
    btn.disabled = true;
    try {
      await this._callService("set_result", { match_id: matchId, home: Number(home), away: Number(away) });
      delete this._draftResults[matchId];
    } finally {
      btn.disabled = false;
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
