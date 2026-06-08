# WM Tippspiel für Home Assistant

Tippspiel für die **Fußball-WM 2026** als Home-Assistant-Integration mit Lovelace-Karte.

## Funktionen

- **Mitspieler verwalten** über die Integration oder den Service `wm_tippspiel.add_player`
- **Tipps abgeben** pro Spiel (Heim/Auswärts-Tore)
- **Ergebnisse eintragen** (Admin-Modus in der Karte oder Service `wm_tippspiel.set_result`)
- **Automatische Punktevergabe**: 3 Punkte exakt, 1 Punkt richtige Tendenz
- **Rangliste** als Sensor und in der Karte
- **Gruppenspiele A–L** der WM 2026 vorinstalliert (72 Spiele + vollständiger KO-Baum)
- **Updates** über den Home-Assistant-Update-Manager (ab v1.2.0)

## Automatische Ergebnisse (openfootball)

Gruppenspiel-Ergebnisse werden **automatisch** aus [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) abgerufen — **ohne API-Schlüssel**.

1. **Einstellungen → Geräte & Dienste → WM Tippspiel → Konfigurieren**
2. „Ergebnisse automatisch abrufen“ aktivieren (Standard: an)
3. Intervall z. B. **900** Sekunden (15 Min.)

Nach jedem beendeten Gruppenspiel werden Ergebnisse eingetragen und Punkte neu berechnet. KO-Ergebnisse und manuelle Einträge (Admin) funktionieren weiterhin über die Karte oder Services.

**Manuell synchronisieren:**

```yaml
service: wm_tippspiel.sync_results
```

Status unter Sensor-Attribut `results_sync` (Rangliste-Sensor; Alias `api_sync`).

## Updates

Updates werden über den **Home-Assistant-Update-Manager** eingespielt (nicht über HACS).

**Einstellungen → System → Updates**

Entity: `update.<tippspiel_name>_software` (am WM-Tippspiel-Gerät)

- Vergleicht die installierte Version (`manifest.json`) mit dem neuesten **[GitHub Release](https://github.com/sulmaring-tech/wm-tippspiel/releases)**
- Update direkt in Home Assistant installieren
- Nach dem Update **Home Assistant neu starten**
- **Update-Check-Intervall**: unter *Geräte & Dienste → WM Tippspiel → Konfigurieren* (Standard **60** Sek. = 1 min, Minimum 60 Sek., Maximum 24 h)

> **Hinweis:** Wenn die Integration zusätzlich über HACS installiert ist, kann es zu doppelten Update-Hinweisen kommen. Updates bitte nur über den Home-Assistant-Update-Manager ausführen.

Neue Versionen werden als Git-Tags veröffentlicht (`v1.6.16`, …).

### Installation (empfohlen)

1. Ordner `custom_components/wm_tippspiel` nach `config/custom_components/` kopieren (oder per GitHub-Release-Zip)
2. Home Assistant **neu starten**
3. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** → **WM Tippspiel** einrichten
4. Lovelace-Ressource hinzufügen (siehe unten)
5. Künftige Updates über **Einstellungen → System → Updates**

### HACS (optional, nur Erstinstallation)

HACS eignet sich für die erste Installation. **Updates bitte nicht über HACS**, sondern über den Home-Assistant-Update-Manager (siehe oben).

1. Repository als Custom Repository hinzufügen (Kategorie: **Integration**)
2. URL: `https://github.com/sulmaring-tech/wm-tippspiel`
3. **WM Tippspiel** installieren
4. Home Assistant **neu starten**
5. Integration einrichten und Lovelace-Ressource hinzufügen

## Lovelace-Karte

Ab **v1.6.17** registriert die Integration die Karten-Ressource **automatisch** in Lovelace (Storage-Modus). Nach einem Update wird die `?v=`-Version ebenfalls automatisch angepasst – **kein manuelles Ändern der Ressource nötig**.

Falls die Karte nicht lädt, kann die Ressource manuell ergänzt werden (Einstellungen → Dashboards → Ressourcen):

```yaml
url: /wm_tippspiel/wm-tippspiel-card.js
type: module
```

**Wichtig:** Die Karte funktioniert erst, wenn die Integration eingerichtet ist und Home Assistant danach neu gestartet wurde.

### Fehler „Custom element not found: wm-tippspiel-card“

1. **Integration eingerichtet?** Unter *Geräte & Dienste* muss „WM Tippspiel“ erscheinen.
2. **URL testen:** Im Browser öffnen: `http://DEINE-HA-IP:8123/wm_tippspiel/wm-tippspiel-card.js`  
   - Seite zeigt JavaScript-Code → Ressource ist OK  
   - **404 / leer** → Integration fehlt oder HA nicht neu gestartet
3. **Ressource prüfen:** Unter *Dashboards → Ressourcen* sollte `/wm_tippspiel/wm-tippspiel-card.js` vorhanden sein. Sonst HA neu starten. Browser-Cache leeren (Strg+F5).
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
| `match_columns` | Spiel-Layout: `auto` (Standard), `1`, `2` oder `3` Spalten |
| `auto_save_tips` | `true` (Standard): Tipps automatisch speichern; `false`: manuell per Button |

Die `player_id` findest du in den Attributen des Spieler-Sensors oder unter `players` am Ranglisten-Sensor.

### Breite der Karte

Home Assistant begrenzt die Kartenbreite über das **Dashboard-Grid** – **12 Spalten = volle Breite der Ansicht**. Die Karte selbst setzt keine maximale Breite.

**Mehr Platz nutzen:**

1. Karte auf **12 Spalten** ziehen (volle Viewbreite)
2. **Panel-Ansicht** verwenden – die Karte füllt dann den gesamten Bildschirm:

```yaml
views:
  - title: WM Tippspiel
    panel: true
    cards:
      - type: custom:wm-tippspiel-card
        entity: sensor.wm_tippspiel_rangliste
        match_columns: auto
```

3. In den Karten-Einstellungen **Spiel-Layout** auf `2` oder `3` Spalten stellen – bei breiter Karte werden Spiele nebeneinander angezeigt

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
