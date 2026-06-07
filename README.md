# WM Tippspiel für Home Assistant

Tippspiel für die **Fußball-WM 2026** als Home-Assistant-Integration mit Lovelace-Karte.

## Funktionen

- **Mitspieler verwalten** über die Integration oder den Service `wm_tippspiel.add_player`
- **Tipps abgeben** pro Spiel (Heim/Auswärts-Tore)
- **Ergebnisse eintragen** (Admin-Modus in der Karte oder Service `wm_tippspiel.set_result`)
- **Automatische Punktevergabe**: 3 Punkte exakt, 1 Punkt richtige Tendenz
- **Rangliste** als Sensor und in der Karte
- **Gruppenspiele A–H** der WM 2026 vorinstalliert (48 Spiele der Gruppen A–H)
- **Updates** über den Home-Assistant-Update-Manager (ab v1.2.0)

## Automatische Ergebnisse (ab v1.3.0)

Ergebnisse können **automatisch** von [API-Football](https://www.api-football.com/) abgerufen werden:

1. Kostenlosen API-Schlüssel erstellen (Free Tier: 100 Anfragen/Tag)
2. **Einstellungen → Geräte & Dienste → WM Tippspiel → Konfigurieren**
3. API-Schlüssel eintragen, „Ergebnisse automatisch abrufen“ aktivieren
4. Intervall z. B. **900** Sekunden (15 Min.)

Nach jedem beendeten Spiel werden Ergebnisse eingetragen und Punkte neu berechnet. Manuelle Ergebnisse (Admin) funktionieren weiterhin.

**Manuell synchronisieren:**

```yaml
service: wm_tippspiel.sync_results
```

Status unter Sensor-Attribut `api_sync` (Rangliste-Sensor).

## Updates

Ab Version **1.2.0** erscheint ein Update-Eintrag unter:

**Einstellungen → System → Updates**

Entity: `update.<tippspiel_name>_software` (am WM-Tippspiel-Gerät)

- Vergleicht die installierte Version mit dem neuesten **[GitHub Release](https://github.com/sulmaring-tech/wm-tippspiel/releases)**
- Update kann direkt in Home Assistant installiert werden
- Nach dem Update ist ein **Neustart** von Home Assistant erforderlich
- **Update-Check-Intervall** (ab v1.3.4): unter *Geräte & Dienste → WM Tippspiel → Konfigurieren* einstellbar (Standard **21600** Sek. = 6 h, Minimum **300** Sek. = 5 min, Maximum 24 h)

Bei Installation über **HACS** erscheint zusätzlich ein HACS-Update-Eintrag. Beide funktionieren parallel.

Neue Versionen werden als Git-Tags veröffentlicht (`v1.2.0`, `v1.2.1`, …).

### HACS (empfohlen)

1. Repository als Custom Repository hinzufügen (Kategorie: **Integration**)
2. URL: `https://github.com/sulmaring-tech/wm-tippspiel`
3. **WM Tippspiel** installieren
4. Home Assistant **neu starten**
5. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** → **WM Tippspiel** einrichten
6. Erst danach die Lovelace-Ressource hinzufügen (siehe unten)

### Manuell

1. Ordner `custom_components/wm_tippspiel` nach `config/custom_components/` kopieren
2. Home Assistant neu starten
3. Integration wie oben einrichten

## Lovelace-Karte

Ressource registrieren (Einstellungen → Dashboards → Ressourcen):

```yaml
url: /wm_tippspiel/wm-tippspiel-card.js?v=1.2.0
type: module
```

**Wichtig:** Die Ressource funktioniert erst, wenn die Integration eingerichtet ist und Home Assistant danach neu gestartet wurde.

### Fehler „Custom element not found: wm-tippspiel-card“

1. **Integration eingerichtet?** Unter *Geräte & Dienste* muss „WM Tippspiel“ erscheinen.
2. **URL testen:** Im Browser öffnen: `http://DEINE-HA-IP:8123/wm_tippspiel/wm-tippspiel-card.js`  
   - Seite zeigt JavaScript-Code → Ressource ist OK  
   - **404 / leer** → Integration fehlt oder HA nicht neu gestartet
3. **Ressource neu laden:** Dashboard-Ressource löschen, mit `?v=1.0.1` neu anlegen, Browser-Cache leeren (Strg+F5).
4. **Alternative (sofort):** Datei `wm-tippspiel-card.js` nach `config/www/` kopieren und als Ressource `/local/wm-tippspiel-card.js` eintragen.

Beispiel-Karte:

```yaml
type: custom:wm-tippspiel-card
entity: sensor.<dein_tippspiel_name>_rangliste
player_id: abc12345
admin: false
show_groups:
  - E
  - A
  - H
```

Die Entity-ID ergibt sich aus dem Namen deines Tippspiels, z. B. `sensor.wm_tippspiel_rangliste` bei Name „WM Tippspiel“.

### Optionen

| Option | Beschreibung |
|--------|--------------|
| `entity` | Sensor „Rangliste“ der Integration (Pflicht) |
| `player_id` | Standard-Spieler-ID für Tippabgabe |
| `admin` | `true` = Ergebnisse in der Karte eintragen |
| `show_groups` | Gruppen filtern, z. B. `["E"]` nur Deutschland-Gruppe |

Die `player_id` findest du in den Attributen des Spieler-Sensors oder unter `players` am Ranglisten-Sensor.

## Services

```yaml
# Tipp abgeben
service: wm_tippspiel.set_tip
data:
  player_id: abc12345
  match_id: E1
  home: 2
  away: 0

# Ergebnis eintragen
service: wm_tippspiel.set_result
data:
  match_id: E1
  home: 3
  away: 1

# Spieler hinzufügen
service: wm_tippspiel.add_player
data:
  name: Max
```

## Sensoren

Nach der Einrichtung werden u. a. erstellt:

- `sensor.wm_tippspiel_rangliste` – Führender + Attribute mit allen Daten
- `sensor.wm_tippspiel_<spielername>` – Punkte pro Spieler

## Hinweise

- Tipps sind nach Anpfiff gesperrt (5 Min. Puffer), außer im Admin-Modus
- Spielplan basiert auf der WM 2026; Play-off-Plätze sind Platzhalter
- Weitere Spiele (K.o.-Runde) können später in `data/matches_wc2026.json` ergänzt werden

## Lizenz

MIT
