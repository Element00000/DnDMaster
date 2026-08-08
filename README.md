# DM Weltkarte

Interaktives Werkzeug für Dungeon Master mit einer interaktiven Karte als zentraler Nabe.
Basiert auf dem Konzept in `projektzusammenfassung-dm-tool.md`.

## Starten

```bash
npm install
npm run dev      # Dev-Server auf http://localhost:5173
npm run build    # Produktions-Build nach dist/
```

## Aktueller Stand — alle Phasen 1–6 umgesetzt

**Karte (Phase 1)**
- Pan (ziehen), Zoom (Mausrad zum Cursor, +/− Buttons), Einpassen (Doppelklick)
- Objekt anlegen: Typ links wählen, dann auf die Karte klicken – jedes Objekt gehört auf eine Karte
- Marker per Drag verschiebbar; anklicken öffnet das Detailpanel rechts
- **Kopieren/Einfügen (Strg+C / Strg+V)**: markierte Objekte oder eine angeklickte Karte. Eine kopierte Karte nimmt ihren Inhalt mit (Objekte und Unterkarten samt deren Objekten). Eingefügt wird an der Mausposition, in die Karte, die dort liegt
- **Duplizieren per Alt+Ziehen**: Alt halten und ein Objekt oder eine eingebettete Karte ziehen – das Original bleibt sichtbar liegen, ein blasses Doppel zeigt, wo die Kopie landet. Der Zeiger kündigt es an, solange Alt gehalten wird
- Eigenes Kartenbild oben hochladbar (**PNG, JPG, WebP** – kein SVG nötig); sonst Platzhalterkarte
- Persistenz über LocalStorage

**Datenmodell & Welten (Phase 2)**
- **Mehrere Kampagnen / Welten** – Umschalter oben, jede mit eigener Karte und Objekten
- **Echte Objekttypen** statt Freitext: Umgebung, Charakter, Ereignis, Gegenstand, Entscheidung, Beschreibung – jeweils mit typ-spezifischen Feldern. Dazu **Fraktion**, die nicht auf der Karte, sondern im Panel „Beziehungen" entsteht
- **Beschreibung**: reiner Vorlesetext an einer Stelle der Karte – was der DM der Gruppe vorliest, wenn sie dort ankommt (Umgebung, Encounter-Einleitung)
- **Geheimnisse** pro Objekt (nur DM sichtbar)
- **Verknüpfungen** zwischen Objekten (z. B. „befindet sich in", „verbündet mit"), bidirektional angezeigt und klickbar zum Navigieren
- **Spieler-Ansicht** (Schalter oben): blendet DM-Geheimnisse und noch nicht entdeckte Objekte aus – Grundlage für späteren Spielerzugang

**Zeit (Phase 3)**
- **Uhrzeit-Regler** über der Karte (24h): Objekte wandern gemäß ihrem Tagesablauf über die Karte
- **Tagesablauf als Timestones**: ab welcher Uhrzeit ein Objekt wo steht – täglich wiederkehrend oder als Ausnahme an einem Kalendertag
- Optionaler **Tag/Nacht-Modus**: färbt die Karte passend zur Uhrzeit ein
- **Kampagnen-Zeitleiste** (Button oben): Ereignisse chronologisch nach Kalendertag, filterbar nach verknüpftem Objekt, Klick springt zum Objekt auf der Karte

**Verzweigte Handlungsstränge (Phase 4)**
- Objekttyp **Entscheidung** mit 3–5 **Optionen** (Kurztitel + Beschreibung), optional an eine Situation (ein Ereignis) gebunden
- Pro Option **Folgen** hinterlegbar: Status/Feld ändern, Objekt auf-/zudecken, Beziehung ändern, oder Freitext-Notiz
- **„Als eingetreten markieren"** wendet die Folgen automatisch auf Karte, Objekte und Beziehungen an; erneutes Klicken oder „Wahl aufheben" macht sie sauber rückgängig
- Nicht gewählte Optionen bleiben grau als Notiz erhalten
- Optionen **verkettbar** („führt zu" nächster Entscheidung) → **Handlungsbaum**-Ansicht (Button oben) zeigt alle Punkte nach Verzweigungstiefe, gewählter Pfad hervorgehoben

**DM-Werkzeuge (Phase 5)**
- **Globale Suche** in der Kopfleiste über alle Objekte und Sitzungsnotizen; Klick springt zum Treffer
- **Werkzeuge**-Panel (Button oben) mit vier Reitern:
  - **Würfel** — w4 bis w100, Anzahl + Modifikator, Vorteil/Nachteil (1w20), großes Ergebnis mit kritischem Treffer/Patzer, Wurfverlauf
  - **Kampf** — Initiative-/HP-Tracker mit Rundenzähler, aktivem Zug, Sortieren, an einen Ort bindbar
  - **Notizen** — Sitzungsprotokoll mit Titel/Datum/Text und Verweisen auf vorgekommene Objekte
  - **Zufall** — Generatoren für Namen, Wetter, Begegnungen und Gerüchte
  - **KI** — Text/Bild (siehe unten)
  - **Musik** — Spotify-Playlists/Tracks pro Kampagne speichern und über den eingebetteten Player abspielen (Ambience am Spieltisch)

**Feinschliff (Phase 6)**
- **Mehrere Kartenebenen** — Leiste oben links: zwischen Welt-, Regional-, Stadtplan wechseln, neue Ebenen anlegen, umbenennen, löschen
- **Orte mit Unterkarte** verknüpfen — im Detailpanel eine Unterkarte wählen und per „Unterkarte öffnen" hineinspringen
- **Nebel des Krieges** pro Ebene — einschalten, dann mit dem Pinsel Bereiche aufdecken (Pinselgröße einstellbar, „Reset" verdeckt wieder). Für den DM halbtransparent, in Spieler-/Tischsicht deckend
- **Spieltischmodus** — aufgeräumte Live-Ansicht: Seitenleisten aus, große Karte, blendet automatisch DM-Geheimnisse und unentdeckte Objekte aus

## Design

Moderne, kühle Slate-Oberfläche mit Indigo als Interaktionsfarbe und Gold als warmem Akzent (Marke, „eingetreten", kritischer Wurf). Alle Farben, Radien und Schatten sind CSS-Tokens in [src/index.css](src/index.css) (`:root`) — zentral anpassbar.

## Technik

- React 18 + TypeScript + Vite
- Zustand (State + LocalStorage-Persistenz via `persist`)
- Eigener SVG-/Transform-basierter Karten-Layer (kein Leaflet), volle Kontrolle über Marker als React-Komponenten

## Projektstruktur

```
src/
  types.ts              Datenmodell (Marker, Ebenen, Objekttypen)
  store/useStore.ts     Zustand-Store + Persistenz
  utils/time.ts         Tageszeit-Helfer (Format, Zeitfenster, Tag/Nacht)
  components/
    MapCanvas.tsx        Pan/Zoom, Marker, Zeitfilter, Tag/Nacht
    MapPin.tsx           Einzelner Marker-Pin (verschiebbar)
    PlaceholderMap.tsx   Generierte Pergament-Karte
    Sidebar.tsx          Objekttypen + gruppierte Liste
    DetailPanel.tsx      Detail-/Bearbeitungsansicht
    DecisionEditor.tsx   Entscheidung: Optionen, Folgen, Verkettung
    TimeSlider.tsx       Uhrzeit-Regler über der Karte
    Timeline.tsx         Kampagnen-Zeitleiste (Kalendertag)
    StoryTree.tsx        Handlungsbaum der Entscheidungen
    TopBar.tsx           Kopfleiste, Kampagnen, Spielermodus, Werkzeuge
```

## Zusätzlich umgesetzt (über den Konzeptplan hinaus)

- **Reiche Ereignisse / Encounter** — Ereignis-Marker mit Art, Inhaltsblöcken (Text/Loot/Bild), Kampfkarte und Kreaturen-Statblocks; **Fight-Modus** mit Kampfkarte + nach Initiative sortierter Kampftabelle (Initiative/HP editierbar, Runden, Fähigkeiten)
- **Export/Import** — Kampagnen/Backups als JSON sichern und laden (☰-Menü oben)
- **Bild-Assets in IndexedDB** — Bilder liegen außerhalb des LocalStorage-Limits; Backups bleiben durch Einbetten autark
- **Beziehungsgraph** — Netzwerkansicht der Objekte und ihrer Verknüpfungen (Button „Beziehungen"), Kraft-Layout, Zoom/Pan, Knoten ziehen/klicken
- **KI-Assistent** (Werkzeuge → Reiter „KI"):
  - **Text/Dialog** über Claude mit eigenem Anthropic-Key (lokal im Browser, nicht in Exporten) — Erzähltexte, Dialoge, freie Prompts auf Basis des aktuellen Projektkontexts
  - **Bildgenerierung** (echte Rasterbilder: Porträts, Karten) über eine **serverseitige Funktion** — der Bild-Key bleibt geheim, auch bei geteilter Nutzung. Provider: Google Gemini (kostenloses Kontingent), OpenAI, oder **Pollinations.ai kostenlos ohne Key** (Standard). Einrichtung siehe [DEPLOY.md](DEPLOY.md)

## Daten & Backup

Kampagnen liegen **lokal im Browser** (LocalStorage; Bilder in IndexedDB) — pro Person/Gerät
getrennt, keine automatische Cloud-Synchronisierung. Damit nichts verloren geht:

- Die App fordert beim Start **persistenten Speicher** an (`navigator.storage.persist()`), damit
  der Browser die Daten nicht bei Speicherdruck löscht.
- **Manuelles Backup** über das ☰-Menü oben: „Backup exportieren" (JSON). Auf einem anderen
  Gerät bzw. nach dem Löschen der Browserdaten per „Importieren …" wiederherstellen.
- Das Menü zeigt das **letzte Backup-Datum** und erinnert, wenn länger keins gemacht wurde.

Für echte geräteübergreifende Synchronisierung mit Login wäre ein Server-Backend nötig
(z. B. Supabase) — bewusst nicht umgesetzt, um ohne externe Infrastruktur auszukommen.

## Offen / mögliche nächste Schritte

- Deployment auf Vercel (Config in `vercel.json`, Anleitung in `DEPLOY.md`)
- Kampf-Tracker im Werkzeug-Panel dauerhaft speichern (aktuell nur zur Laufzeit)
```
