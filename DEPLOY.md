# Deployment auf Vercel

Die App ist eine statische Single-Page-App (React + Vite). Konfiguration liegt in
[vercel.json](vercel.json): Framework `vite`, Build `npm run build`, Ausgabe `dist/`.

Es gibt drei Wege. **Weg A (Git)** ist am bequemsten für dauerhaftes Hosting.

## Weg A — Git-Anbindung (empfohlen, Auto-Deploy bei jedem Push)

1. Projekt zu GitHub/GitLab/Bitbucket pushen (falls noch nicht geschehen):
   ```bash
   git add -A
   git commit -m "Vercel-Deployment vorbereiten"
   git push -u origin main
   ```
2. Auf https://vercel.com einloggen → **Add New… → Project**.
3. Repository importieren. Vercel erkennt Vite automatisch; dank `vercel.json`
   stimmen Build (`npm run build`) und Ausgabe (`dist`) bereits.
4. **Deploy** klicken. Ergebnis: eine URL wie `dein-projekt.vercel.app`.
5. Jeder weitere `git push` deployt automatisch neu.

## Weg B — Vercel CLI (ohne Git)

```bash
npm i -g vercel      # einmalig
vercel login         # einmalig, öffnet den Browser
vercel                # Vorschau-Deploy (folge den Fragen, Defaults passen)
vercel --prod        # Produktions-Deploy → finale URL
```

## Weg C — Vorgefertigtes dist hochladen

```bash
npm run build        # erzeugt dist/
npm i -g vercel
vercel deploy --prebuilt dist   # oder dist/ im Vercel-Dashboard per Drag&Drop
```

## Eigene Domain

Im Vercel-Dashboard unter **Settings → Domains** eine eigene Domain verbinden.

## Wichtig: Daten sind lokal pro Gerät

Die Kampagnendaten liegen im **LocalStorage des jeweiligen Browsers** (kein Server,
keine Anmeldung). Das heißt:

- Die Seite ist von überall erreichbar, aber **jedes Gerät/jeder Browser hat seinen
  eigenen, getrennten Datenstand**. Es gibt keine automatische Synchronisierung.
- Zum Übertragen zwischen Geräten wäre später ein Backend / Cloud-Sync nötig
  (nicht Teil des aktuellen Stands).
- Achtung: Browser-Daten löschen entfernt auch die Kampagnen. Wichtig ist daher eine
  spätere Export/Import-Funktion (guter nächster Schritt, falls gewünscht).
