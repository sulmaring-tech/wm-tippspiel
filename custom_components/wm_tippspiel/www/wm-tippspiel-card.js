const WM_TIPPSPIEL_CARD_VERSION = "1.0.0";

const TABS = [
  { id: "tips", label: "Tippen", icon: "mdi:soccer-field" },
  { id: "matches", label: "Spiele", icon: "mdi:calendar-clock" },
  { id: "standings", label: "Rangliste", icon: "mdi:trophy" },
];

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
  const kickoff = new Date(iso).getTime();
  return Date.now() >= kickoff - bufferMinutes * 60 * 1000;
}

class WmTippspielCard extends HTMLElement {
  static getStubConfig() {
    return {
      type: "custom:wm-tippspiel-card",
      entity: "sensor.wm_tippspiel_rangliste",
      player_id: "",
      admin: false,
      show_groups: ["E", "A", "B", "C", "D", "F", "G", "H"],
    };
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("entity ist erforderlich (Sensor „Rangliste“ der Integration)");
    }
    this._config = {
      admin: false,
      show_groups: null,
      ...config,
    };
    this._tab = this._tab || "tips";
    this._draftTips = this._draftTips || {};
    this._draftResults = this._draftResults || {};
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    const state = hass.states[this._config.entity];
    if (!state) {
      this._renderMissing();
      return;
    }
    this._state = state;
    if (prev !== hass) this._ensurePlayer();
    this._render();
  }

  getCardSize() {
    return 6;
  }

  _ensurePlayer() {
    const players = this._state?.attributes?.players || [];
    if (!players.length) return;
    if (
      this._config.player_id &&
      players.some((p) => p.id === this._config.player_id)
    ) {
      this._selectedPlayer = this._config.player_id;
      return;
    }
    this._selectedPlayer = players[0].id;
  }

  _renderMissing() {
    if (!this._hass) return;
    this.innerHTML = `
      <ha-card>
        <div class="wm-empty">
          <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
          <span>Entity ${this._config.entity} nicht gefunden.</span>
          <span class="wm-hint">Integration „WM Tippspiel“ einrichten und Sensor hinzufügen.</span>
        </div>
      </ha-card>
    `;
    this._attachStyles();
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
    const groups = this._config.show_groups;
    if (!groups || !groups.length) return matches;
    const set = new Set(groups.map((g) => String(g).toUpperCase()));
    return matches.filter((m) => set.has(String(m.group || "").toUpperCase()));
  }

  async _callService(service, data) {
    await this._hass.callService("wm_tippspiel", service, data);
  }

  _attachStyles() {
    if (this.querySelector("style")) return;
    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; }
      ha-card {
        overflow: hidden;
        position: relative;
        border-radius: 16px;
        background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
      }
      ha-card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.08);
      }
      .wm-inner { position: relative; padding: 16px; }
      .wm-header {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 14px;
      }
      .wm-title {
        display: flex; align-items: center; gap: 10px;
        font-size: 1.15rem; font-weight: 600;
      }
      .wm-title ha-icon { color: #fbbf24; }
      .wm-tabs {
        display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;
      }
      .wm-tab {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        color: var(--primary-text-color);
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 0.82rem;
        cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .wm-tab.active {
        background: rgba(251, 191, 36, 0.18);
        border-color: rgba(251, 191, 36, 0.45);
        color: #fde68a;
      }
      .wm-select {
        background: rgba(0,0,0,0.25);
        color: var(--primary-text-color);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 0.9rem;
        min-width: 140px;
      }
      .wm-match {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 10px;
        background: rgba(0,0,0,0.15);
      }
      .wm-match-meta {
        font-size: 0.75rem; opacity: 0.72;
        display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .wm-teams {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 8px;
      }
      .wm-team { font-weight: 600; font-size: 0.95rem; }
      .wm-team.away { text-align: right; }
      .wm-score-row {
        display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .wm-score-input {
        width: 42px; text-align: center;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.25);
        color: var(--primary-text-color);
        padding: 6px 4px;
        font-size: 1rem;
        font-weight: 700;
      }
      .wm-score-input:disabled { opacity: 0.45; }
      .wm-sep { opacity: 0.5; font-weight: 700; }
      .wm-result-badge {
        font-size: 0.72rem;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(74, 222, 128, 0.15);
        color: #86efac;
        margin-top: 6px;
        display: inline-block;
      }
      .wm-save {
        margin-top: 8px;
        border: none;
        border-radius: 10px;
        padding: 8px 12px;
        background: rgba(251, 191, 36, 0.22);
        color: #fde68a;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.82rem;
      }
      .wm-save:disabled { opacity: 0.4; cursor: default; }
      .wm-standing {
        display: grid;
        grid-template-columns: 36px 1fr repeat(3, 52px);
        gap: 8px;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        font-size: 0.9rem;
      }
      .wm-standing.head {
        font-size: 0.72rem; opacity: 0.65; text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .wm-rank {
        width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.08);
        font-weight: 700; font-size: 0.82rem;
      }
      .wm-rank.gold { background: rgba(251,191,36,0.25); color: #fde68a; }
      .wm-rank.silver { background: rgba(203,213,225,0.2); color: #e2e8f0; }
      .wm-rank.bronze { background: rgba(180,83,9,0.25); color: #fdba74; }
      .wm-num { text-align: center; font-variant-numeric: tabular-nums; }
      .wm-empty {
        padding: 24px; text-align: center;
        display: flex; flex-direction: column; gap: 8px; opacity: 0.85;
      }
      .wm-hint { font-size: 0.82rem; opacity: 0.7; }
      .wm-rules {
        margin-top: 12px; font-size: 0.75rem; opacity: 0.65;
        line-height: 1.45;
      }
      .wm-group-label {
        font-size: 0.78rem; font-weight: 700; opacity: 0.55;
        margin: 14px 0 8px; text-transform: uppercase; letter-spacing: 0.06em;
      }
      .wm-admin-tag {
        font-size: 0.68rem;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(248,113,113,0.18);
        color: #fca5a5;
      }
    `;
    this.appendChild(style);
  }

  _render() {
    this._attachStyles();
    const { players, matches, standings, tips, results } = this._data();
    const filtered = this._filteredMatches(matches);
    const playerId = this._selectedPlayer;
    const playerTips = tips[playerId] || {};

    let body = "";
    if (this._tab === "standings") {
      body = this._renderStandings(standings);
    } else if (this._tab === "matches") {
      body = this._renderMatchesList(filtered, results);
    } else {
      body = this._renderTips(filtered, playerTips, results, playerId);
    }

    this.innerHTML = `
      <ha-card>
        <div class="wm-inner">
          <div class="wm-header">
            <div class="wm-title">
              <ha-icon icon="mdi:trophy-variant"></ha-icon>
              <span>WM Tippspiel</span>
              ${this._config.admin ? '<span class="wm-admin-tag">Admin</span>' : ""}
            </div>
            ${
              players.length
                ? `<select class="wm-select" data-action="select-player">
                    ${players
                      .map(
                        (p) =>
                          `<option value="${p.id}" ${p.id === playerId ? "selected" : ""}>${p.name}</option>`
                      )
                      .join("")}
                   </select>`
                : ""
            }
          </div>
          <div class="wm-tabs">
            ${TABS.map(
              (t) =>
                `<button type="button" class="wm-tab ${this._tab === t.id ? "active" : ""}" data-tab="${t.id}">
                  <ha-icon icon="${t.icon}"></ha-icon>${t.label}
                </button>`
            ).join("")}
          </div>
          ${body}
          <div class="wm-rules">
            Punkte: 3 für exaktes Ergebnis · 1 für richtige Tendenz (Sieger/Unentschieden)
          </div>
        </div>
      </ha-card>
    `;

    this.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._tab = btn.getAttribute("data-tab");
        this._render();
      });
    });

    const sel = this.querySelector("[data-action=select-player]");
    if (sel) {
      sel.addEventListener("change", (ev) => {
        this._selectedPlayer = ev.target.value;
        this._render();
      });
    }

    this.querySelectorAll("[data-action=save-tip]").forEach((btn) => {
      btn.addEventListener("click", () => this._saveTip(btn));
    });

    this.querySelectorAll("[data-action=save-result]").forEach((btn) => {
      btn.addEventListener("click", () => this._saveResult(btn));
    });

    this.querySelectorAll(".wm-score-input").forEach((input) => {
      input.addEventListener("input", (ev) => {
        const matchId = ev.target.getAttribute("data-match");
        const side = ev.target.getAttribute("data-side");
        const kind = ev.target.getAttribute("data-kind") || "tip";
        const bucket = kind === "result" ? this._draftResults : this._draftTips;
        bucket[matchId] = bucket[matchId] || {};
        bucket[matchId][side] = ev.target.value;
      });
    });
  }

  _renderStandings(standings) {
    if (!standings.length) {
      return `<div class="wm-empty">Noch keine Rangliste – Ergebnisse eintragen oder tippen.</div>`;
    }
    const rows = standings
      .map((s, i) => {
        const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return `
          <div class="wm-standing">
            <div class="wm-rank ${rankClass}">${s.rank}</div>
            <div>${s.name}</div>
            <div class="wm-num">${s.points}</div>
            <div class="wm-num">${s.exact}</div>
            <div class="wm-num">${s.tendency}</div>
          </div>`;
      })
      .join("");
    return `
      <div class="wm-standing head">
        <div>#</div><div>Spieler</div><div class="wm-num">Pkt</div>
        <div class="wm-num">Exakt</div><div class="wm-num">Tendenz</div>
      </div>
      ${rows}
    `;
  }

  _renderMatchesList(matches, results) {
    if (!matches.length) return `<div class="wm-empty">Keine Spiele geladen.</div>`;
    let html = "";
    let lastGroup = "";
    for (const m of matches) {
      if (m.group && m.group !== lastGroup) {
        lastGroup = m.group;
        html += `<div class="wm-group-label">Gruppe ${m.group}</div>`;
      }
      const res = results[m.id];
      html += `
        <div class="wm-match">
          <div class="wm-match-meta">
            <span>${formatKickoff(m.kickoff)}</span>
            <span>${m.venue || ""}</span>
          </div>
          <div class="wm-teams">
            <div class="wm-team">${m.home}</div>
            <div class="wm-score-row">
              <span>${res ? res.home : "–"}</span>
              <span class="wm-sep">:</span>
              <span>${res ? res.away : "–"}</span>
            </div>
            <div class="wm-team away">${m.away}</div>
          </div>
          ${res ? `<span class="wm-result-badge">Endstand</span>` : ""}
        </div>`;
    }
    return html;
  }

  _renderTips(matches, playerTips, results, playerId) {
    if (!playerId) {
      return `<div class="wm-empty">Keine Spieler konfiguriert.</div>`;
    }
    if (!matches.length) return `<div class="wm-empty">Keine Spiele für die gewählten Gruppen.</div>`;

    let html = "";
    let lastGroup = "";
    for (const m of matches) {
      if (m.group && m.group !== lastGroup) {
        lastGroup = m.group;
        html += `<div class="wm-group-label">Gruppe ${m.group}</div>`;
      }
      const locked = isPastKickoff(m.kickoff) && !this._config.admin;
      const tip = this._draftTips[m.id] || playerTips[m.id] || {};
      const res = results[m.id];
      const homeVal = tip.home ?? "";
      const awayVal = tip.away ?? "";

      html += `
        <div class="wm-match">
          <div class="wm-match-meta">
            <span>${formatKickoff(m.kickoff)} · ${m.id}</span>
            <span>${m.venue || ""}</span>
          </div>
          <div class="wm-teams">
            <div class="wm-team">${m.home}</div>
            <div class="wm-score-row">
              <input class="wm-score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="home" data-kind="tip"
                value="${homeVal}" ${locked ? "disabled" : ""} />
              <span class="wm-sep">:</span>
              <input class="wm-score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="away" data-kind="tip"
                value="${awayVal}" ${locked ? "disabled" : ""} />
            </div>
            <div class="wm-team away">${m.away}</div>
          </div>
          ${res ? `<span class="wm-result-badge">Ergebnis ${res.home}:${res.away}</span>` : ""}
          ${
            !locked
              ? `<button type="button" class="wm-save" data-action="save-tip" data-match="${m.id}">Tipp speichern</button>`
              : `<div class="wm-hint" style="margin-top:6px">Tippabgabe geschlossen</div>`
          }
          ${
            this._config.admin
              ? `
            <div class="wm-score-row" style="margin-top:10px">
              <input class="wm-score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="home" data-kind="result"
                value="${(this._draftResults[m.id] || res || {}).home ?? ""}" placeholder="H" />
              <span class="wm-sep">:</span>
              <input class="wm-score-input" type="number" min="0" max="20" data-match="${m.id}" data-side="away" data-kind="result"
                value="${(this._draftResults[m.id] || res || {}).away ?? ""}" placeholder="A" />
              <button type="button" class="wm-save" data-action="save-result" data-match="${m.id}">Ergebnis</button>
            </div>`
              : ""
          }
        </div>`;
    }
    return html;
  }

  async _saveTip(btn) {
    const matchId = btn.getAttribute("data-match");
    const draft = this._draftTips[matchId] || {};
    const inputs = this.querySelectorAll(`.wm-score-input[data-match="${matchId}"][data-kind="tip"]`);
    let home = draft.home;
    let away = draft.away;
    inputs.forEach((inp) => {
      if (inp.getAttribute("data-side") === "home") home = inp.value;
      if (inp.getAttribute("data-side") === "away") away = inp.value;
    });
    if (home === "" || away === "" || home == null || away == null) return;
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
    const draft = this._draftResults[matchId] || {};
    const inputs = this.querySelectorAll(`.wm-score-input[data-match="${matchId}"][data-kind="result"]`);
    let home = draft.home;
    let away = draft.away;
    inputs.forEach((inp) => {
      if (inp.getAttribute("data-side") === "home") home = inp.value;
      if (inp.getAttribute("data-side") === "away") away = inp.value;
    });
    if (home === "" || away === "" || home == null || away == null) return;
    btn.disabled = true;
    try {
      await this._callService("set_result", {
        match_id: matchId,
        home: Number(home),
        away: Number(away),
      });
      delete this._draftResults[matchId];
    } finally {
      btn.disabled = false;
    }
  }
}

customElements.define("wm-tippspiel-card", WmTippspielCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "wm-tippspiel-card",
  name: "WM Tippspiel",
  description: "Fußball-WM Tippspiel mit Rangliste und Tippabgabe",
  preview: true,
});

console.info(`WM Tippspiel Card v${WM_TIPPSPIEL_CARD_VERSION} geladen`);
