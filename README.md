# DM Weltkarte

Interaktives Werkzeug für Dungeon Master mit einer interaktiven Karte als zentraler Nabe.
Basiert auf dem Konzept in `projektzusammenfassung-dm-tool.md`.

## Starten

```bash
npm install
npm run dev      # Dev-Server auf http://localhost:5173
npm run build    # Produktions-Build nach dist/
```

## Aktueller Stand — Phase 1 + Phase 2

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

## Technik

- React 18 + TypeScript + Vite
- Zustand (State + LocalStorage-Persistenz via `persist`)
- Eigener SVG-/Transform-basierter Karten-Layer (kein Leaflet), volle Kontrolle über Marker als React-Komponenten

## Projektstruktur

```
src/
  types.ts              Datenmodell (Marker, Ebenen, Objekttypen)
  store/useStore.ts     Zustand-Store + Persistenz
  components/
    MapCanvas.tsx        Pan/Zoom + Marker-Overlay
    MapPin.tsx           Einzelner Marker-Pin
    PlaceholderMap.tsx   Generierte Pergament-Karte
    Sidebar.tsx          Marker-Typen + Liste
    DetailPanel.tsx      Detail-/Bearbeitungsansicht
    TopBar.tsx           Kopfleiste + Kartenupload
```

## Nächste Phasen (siehe Konzeptdokument)

- **Phase 3** Zeitleiste + Uhrzeit-Regler
- **Phase 4** Verzweigte Handlungsstränge (Entscheidungspunkte)
- **Phase 5** DM-Werkzeuge (Kampf-Tracker, Notizen, Würfel, Suche)
- **Phase 6** Spieltischmodus, Nebel des Krieges, mehrere Kartenebenen
```
