# DM Weltkarte

Interaktives Werkzeug für Dungeon Master mit einer interaktiven Karte als zentraler Nabe.
Basiert auf dem Konzept in `projektzusammenfassung-dm-tool.md`.

## Starten

```bash
npm install
npm run dev      # Dev-Server auf http://localhost:5173
npm run build    # Produktions-Build nach dist/
```

## Aktueller Stand — Phase 1 (Grundgerüst)

- **Karte** mit Pan (ziehen), Zoom (Mausrad zum Cursor, +/− Buttons), Einpassen (Doppelklick)
- **Marker setzen**: Typ in der linken Leiste wählen, dann auf die Karte klicken
- **Marker anklicken** öffnet das Detailpanel rechts (Name, Typ, Beschreibung, Sichtbarkeit)
- **Sidebar** listet alle Marker; Auswahl synchron mit Karte
- **Eigenes Kartenbild** oben hochladbar; alternativ generierte Platzhalterkarte
- **Persistenz** über LocalStorage — Daten bleiben nach Reload erhalten

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

- **Phase 2** Datenmodell: eigene Objekttypen (Orte, Charaktere, Fraktionen, Ereignisse) mit echten Verknüpfungen statt Freitext
- **Phase 3** Zeitleiste + Uhrzeit-Regler
- **Phase 4** Verzweigte Handlungsstränge (Entscheidungspunkte)
- **Phase 5** DM-Werkzeuge (Kampf-Tracker, Notizen, Würfel, Suche)
- **Phase 6** Spieltischmodus, Nebel des Krieges, mehrere Kartenebenen
```
