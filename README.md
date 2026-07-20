# DM Weltkarte

Interaktives Werkzeug für Dungeon Master mit einer interaktiven Karte als zentraler Nabe.
Basiert auf dem Konzept in `projektzusammenfassung-dm-tool.md`.

## Starten

```bash
npm install
npm run dev      # Dev-Server auf http://localhost:5173
npm run build    # Produktions-Build nach dist/
```

## Aktueller Stand — Phase 1 + 2 + 3 + 4

**Karte (Phase 1)**
- Pan (ziehen), Zoom (Mausrad zum Cursor, +/− Buttons), Einpassen (Doppelklick)
- Objekt anlegen: Typ links wählen, dann auf die Karte klicken (oder „Ohne Karte anlegen")
- Marker per Drag verschiebbar; anklicken öffnet das Detailpanel rechts
- Eigenes Kartenbild oben hochladbar (**PNG, JPG, WebP** – kein SVG nötig); sonst Platzhalterkarte
- Persistenz über LocalStorage

**Datenmodell & Welten (Phase 2)**
- **Mehrere Kampagnen / Welten** – Umschalter oben, jede mit eigener Karte und Objekten
- **Echte Objekttypen** statt Freitext: Ort, Charakter, Fraktion, Ereignis, Quest, Gegenstand, Entscheidungspunkt (+ Gefahr/Schatz), jeweils mit typ-spezifischen Feldern
- **Geheimnisse** pro Objekt (nur DM sichtbar)
- **Verknüpfungen** zwischen Objekten (z. B. „befindet sich in", „verbündet mit"), bidirektional angezeigt und klickbar zum Navigieren
- **Spieler-Ansicht** (Schalter oben): blendet DM-Geheimnisse und noch nicht entdeckte Objekte aus – Grundlage für späteren Spielerzugang

**Zeit (Phase 3)**
- **Uhrzeit-Regler** über der Karte (24h): blendet Marker nach hinterlegtem Zeitfenster ein/aus (z. B. Markt 8–18 Uhr, Wache 22–6 Uhr über Mitternacht). Marker ohne Zeitfenster bleiben immer sichtbar
- Optionaler **Tag/Nacht-Modus**: färbt die Karte passend zur Uhrzeit ein
- **Kampagnen-Zeitleiste** (Button oben): Ereignisse chronologisch nach Kalendertag, filterbar nach verknüpftem Objekt, Klick springt zum Objekt auf der Karte
- Zeit-Felder pro Objekt im Detailpanel: Kalendertag + Zeitfenster (Von/Bis)

**Verzweigte Handlungsstränge (Phase 4)**
- Objekttyp **Entscheidungspunkt** mit 3–5 **Optionen** (Kurztitel + Beschreibung), optional an eine Situation (Ereignis/Quest) gebunden
- Pro Option **Folgen** hinterlegbar: Status/Feld ändern, Objekt auf-/zudecken, Beziehung ändern, oder Freitext-Notiz
- **„Als eingetreten markieren"** wendet die Folgen automatisch auf Karte, Objekte und Beziehungen an; erneutes Klicken oder „Wahl aufheben" macht sie sauber rückgängig
- Nicht gewählte Optionen bleiben grau als Notiz erhalten
- Optionen **verkettbar** („führt zu" nächstem Entscheidungspunkt) → **Handlungsbaum**-Ansicht (Button oben) zeigt alle Punkte nach Verzweigungstiefe, gewählter Pfad hervorgehoben

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
    DecisionEditor.tsx   Entscheidungspunkt: Optionen, Folgen, Verkettung
    TimeSlider.tsx       Uhrzeit-Regler über der Karte
    Timeline.tsx         Kampagnen-Zeitleiste (Kalendertag)
    StoryTree.tsx        Handlungsbaum der Entscheidungspunkte
    TopBar.tsx           Kopfleiste, Kampagnen, Spielermodus, Werkzeuge
```

## Nächste Phasen (siehe Konzeptdokument)

- **Phase 5** DM-Werkzeuge (Kampf-Tracker, Notizen, Würfel, Suche)
- **Phase 6** Spieltischmodus, Nebel des Krieges, mehrere Kartenebenen
```
