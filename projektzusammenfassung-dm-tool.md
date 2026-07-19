# Projekt: Interaktive Weltkarte für Dungeon Master

## 1. Vision

Ein digitales Werkzeug, dessen Zentrum eine interaktive Karte ist. Auf dieser Karte legt der Dungeon Master Orte, Charaktere, Fraktionen und Ereignisse ab und verknüpft sie miteinander. Rund um die Karte gruppieren sich weitere Werkzeuge, die beim Entwickeln und beim Leiten einer D&D Kampagne helfen: Zeitleiste, Charakterdatenbank, Sitzungsnotizen, Kampfhilfen. Die Karte ist nicht nur Dekoration, sondern die Navigationsebene durch die gesamte Kampagne: ein Klick auf einen Ort öffnet seine Geschichte, seine Bewohner und seine offenen Handlungsstränge.

## 2. Kernkonzept: die Karte als Nabe

* Eine oder mehrere Kartenebenen (Weltkarte, Regionalkarten, Stadtpläne, Dungeonpläne), zwischen denen man hinein und hinaus zoomen oder wechseln kann
* Eigene Kartenbilder hochladbar (gezeichnete oder generierte Karten), alternativ eine einfache generierte Platzhalterkarte für den Start
* Frei platzierbare Marker für Orte, NSCs, Fraktionssitze, Ereignisse, Gefahren oder Schätze
* Marker sind anklickbar und öffnen ein Detailfenster mit allen hinterlegten Informationen
* Verbindungslinien zwischen Orten, zum Beispiel für Reiserouten, Handelswege oder Fraktionsbeziehungen, mit Beschriftung (Entfernung, Reisezeit, Gefahrenstufe)
* Sichtbarkeitsstufen pro Marker: was der DM sieht versus was die Spieler bereits entdeckt haben (Nebel des Krieges, der sich mit dem Fortschritt der Kampagne lichtet)
* Ein Zeitregler direkt über der Karte (eine 24 Stunden Uhr, per Ziehpunkt oder Pfeiltasten bedienbar), der Marker abhängig von ihrer hinterlegten Uhrzeit ein und ausblendet

## 3. Inhaltstypen, die hinterlegt werden können

**Orte**
Name, Beschreibung, Kartenausschnitt oder Unterkarte, verbundene NSCs, aktueller Status (unentdeckt, besucht, zerstört, kontrolliert von Fraktion X)

**Charaktere (NSCs und Spielercharaktere)**
Name, Rolle, Kurzbeschreibung, Motivation, Beziehungen zu anderen Charakteren, aktueller Aufenthaltsort, Statuswerte optional, Geheimnisse (nur für den DM sichtbar)

**Fraktionen und Organisationen**
Name, Ziel, Ressourcen, Beziehungen zu anderen Fraktionen (verbündet, verfeindet, neutral), Einflussgebiet auf der Karte

**Ereignisse**
Titel, Beschreibung, Zeitpunkt oder Zeitraum, beteiligte Charaktere und Orte, Ursache und Folge (was hat dieses Ereignis ausgelöst, was löst es aus)

**Quests und Handlungsstränge**
Titel, Status (offen, aktiv, abgeschlossen, gescheitert), beteiligte Charaktere und Orte, Notizen zu möglichen Entwicklungen, optional verknüpft mit einem oder mehreren Entscheidungspunkten (siehe Abschnitt 4)

**Gegenstände**
Name, Beschreibung, aktueller Besitzer oder Fundort, Bedeutung für die Geschichte

## 4. Verzweigte Handlungsstränge (Entscheidungspunkte)

Damit sich die Geschichte tatsächlich nach den Entscheidungen der Spielgruppe entwickelt, lassen sich an ausgewählten Stellen der Kampagne Entscheidungspunkte hinterlegen, an denen die Handlung in unterschiedliche Richtungen weiterläuft.

* Ein Entscheidungspunkt gehört zu einer Situation (zum Beispiel einem Ereignis oder einer Quest) und enthält 3 bis 5 mögliche Optionen mit je einer kurzen Beschreibung
* Jede Option kann eigene Folgen auslösen: neue oder veränderte Ereignisse, ein anderer Status bei Orten oder Fraktionen, neue Marker auf der Karte, ein verändertes Verhältnis zwischen NSCs
* Sobald eine Option während des Spiels gewählt wird, markiert der DM sie als eingetreten, und die zugehörigen Folgen werden automatisch für die Karte, die Zeitleiste und die betroffenen Charaktere übernommen. Die übrigen, nicht gewählten Optionen bleiben als Notiz erhalten, falls sie später doch noch relevant werden oder man den ursprünglichen Plan nachschlagen möchte
* Entscheidungspunkte lassen sich verketten, sodass eine gewählte Option wiederum zum nächsten Entscheidungspunkt führt. Daraus entsteht ein Handlungsbaum, der sich als eigene Baum oder Netzwerkansicht darstellen lässt, ähnlich wie der Beziehungsgraph, nur für den Verlauf der Geschichte statt für Charaktere
* Auf der Karte selbst zeigt ein Entscheidungspunkt-Marker beim Anklicken die offenen Optionen an, sodass der DM während der Sitzung direkt am jeweiligen Ort nachsehen kann, welche Wege noch offenstehen
* Optional: mehrere parallele Handlungsstränge gleichzeitig im Blick behalten, etwa wenn verschiedene Spielergruppen oder Charaktere an unterschiedlichen Orten unterschiedliche Entscheidungen getroffen haben

## 5. Zeitliche Dimension

Zwei unterschiedliche Zeitebenen sind sinnvoll, da sie unterschiedliche Fragen beantworten: wann in der langen Kampagnengeschichte etwas passiert (Kalendertag), und wann im Tagesablauf etwas stattfindet (Uhrzeit).

**Kampagnen-Zeitleiste (nach Datum)**

* Eine Zeitleiste, auf der Ereignisse chronologisch angeordnet sind, sowohl die Vorgeschichte der Welt als auch die Sitzungen der laufenden Kampagne
* Filterbar nach Ort, Charakter oder Fraktion, sodass man zum Beispiel nur die Ereignisse rund um eine bestimmte Stadt sehen kann
* Verknüpfung mit der Karte: ein Ereignis auf der Zeitleiste zeigt seinen Ort auf der Karte an, und umgekehrt

**Tageszeit-Filter auf der Karte (nach Uhrzeit)**

* Jedes Ereignis und jeder Marker kann optional ein Zeitfenster bekommen (zum Beispiel Wache patrouilliert von 22 bis 6 Uhr, Markt geöffnet von 8 bis 18 Uhr, Geist erscheint nur um Mitternacht)
* Der Zeitregler aus Abschnitt 2 bewegt sich über den Tag, und die Karte blendet passend dazu nur die Marker ein, die zu dieser Uhrzeit aktiv sind
* Marker ohne hinterlegte Uhrzeit gelten als dauerhaft sichtbar und bleiben unabhängig von der Reglerposition auf der Karte
* Ein optionaler Tag und Nacht Modus färbt die Karte zusätzlich passend zur eingestellten Uhrzeit ein, rein zur besseren Orientierung
* Nützlich für lebendige Orte: eine Stadt, in der tagsüber der Markt zu sehen ist und nachts stattdessen Wachposten und nächtliche Zufallsbegegnungen erscheinen
* Diese Uhrzeit-Ebene ist unabhängig vom Kalendertag der Kampagnen-Zeitleiste, lässt sich aber mit ihr kombinieren, sodass ein Ereignis sowohl an einem bestimmten Kampagnentag als auch nur zu einer bestimmten Uhrzeit an diesem Tag sichtbar wird

## 6. Zusätzliche DM Werkzeuge

* Kampf und Initiative Tracker (wie im ersten Entwurf), idealerweise pro Ort aufrufbar
* Sitzungsprotokoll: Notizen pro Sitzung, mit Verweisen auf Charaktere und Orte, die vorkamen
* Zufallsgeneratoren für Namen, Wettbedingungen, kleine Begegnungen oder Gerüchte
* Beziehungsgraph als Alternative oder Ergänzung zur Karte: eine Netzwerkansicht, welche Charaktere und Fraktionen wie miteinander verbunden sind
* Würfelwerkzeug für Proben und Schaden
* Eine einfache Suchfunktion über alle Inhalte hinweg (Orte, Charaktere, Ereignisse, Notizen)

## 7. Möglicher Aufbau der Oberfläche

* Hauptansicht: die Karte, groß und zentral
* Seitenleiste mit Kategorien (Orte, Charaktere, Fraktionen, Ereignisse, Quests, Entscheidungspunkte), über die man auch ohne Kartenklick navigieren kann
* Detailansicht als Seitenpanel oder Modal, wenn man auf einen Marker oder Listeneintrag klickt
* Obere Leiste mit Zugriff auf Zeitleiste, Sitzungsnotizen und Werkzeuge
* Zwei Modi denkbar: ein Vorbereitungsmodus (volle Sicht auf alles, Bearbeitung möglich) und ein Spieltischmodus (reduzierte, aufgeräumte Ansicht für den Live-Einsatz am Tisch)

## 8. Technischer Rahmen (Vorschlag)

* Kartendarstellung: SVG oder Canvas basiert (zum Beispiel mit Leaflet für eine klassische Kartenmetapher mit Zoom und Ebenen, oder eine einfache eigene SVG Lösung für mehr Kontrolle über das Aussehen)
* Datenmodell: zentrale Objekte (Orte, Charaktere, Fraktionen, Ereignisse, Quests, Items, Entscheidungspunkte mit ihren Optionen) mit Verknüpfungen untereinander, am besten als eigenständige Datensätze, nicht als reiner Freitext. Ein Entscheidungspunkt referenziert dabei die Ereignisse, Orte oder Statusänderungen, die jede seiner Optionen auslöst
* Speicherung: lokale Datenbank (zum Beispiel SQLite) für ein Ein-Nutzer-Tool, mit der Möglichkeit später eine Cloud-Synchronisierung oder Mehrbenutzerfähigkeit (für Spieler-Zugriff) zu ergänzen
* Frontend: React für die interaktiven Elemente, da sich Kartenmarker, Detailpanels und Filterlisten gut als Komponenten abbilden lassen

## 9. Vorschlag für eine Umsetzung in Phasen

**Phase 1, Grundgerüst**
Karte mit Zoom, Marker setzen und anklicken, einfache Detailansicht mit Freitext

**Phase 2, Datenmodell**
Eigene Objekttypen für Orte, Charaktere, Fraktionen, Ereignisse mit echten Verknüpfungen statt Freitext

**Phase 3, Zeitleiste**
Chronologische Ansicht nach Kalendertag, Verknüpfung mit der Karte, sowie der Uhrzeit-Regler, der Marker auf der Karte ein und ausblendet

**Phase 4, Entscheidungsstränge**
Entscheidungspunkte mit 3 bis 5 Optionen anlegen, Folgen je Option hinterlegen, gewählte Option markieren und Auswirkungen auf Karte und Zeitleiste automatisch übernehmen

**Phase 5, DM Werkzeuge**
Kampf Tracker, Sitzungsnotizen, Würfelwerkzeug, Suche

**Phase 6, Feinschliff**
Spieltischmodus, Nebel des Krieges für Spieler-Sichtbarkeit, eigene Kartenbilder hochladbar

## 10. Offene Fragen für die weitere Planung

* Soll das Tool nur für dich als DM sein, oder sollen Spieler später einen eigenen, eingeschränkten Zugang bekommen
* Reicht eine einzelne Kampagne, oder soll das Tool mehrere Kampagnen und Welten verwalten können
* Wie wichtig ist der Spieltischmodus für den Liveeinsatz während der Sitzung im Vergleich zur reinen Vorbereitung zuhause
* Soll die Karte handgezeichnet hochgeladen werden, oder wird auch eine Kartengenerierung innerhalb des Tools gewünscht
* Soll der Uhrzeit-Regler nur für die aktuell ausgewählte Karte gelten, oder soll eine eingestellte Uhrzeit auch beim Wechsel zwischen Weltkarte, Regionalkarte und Stadtplan erhalten bleiben
* Sollen nicht gewählte Optionen eines Entscheidungspunkts nach der Wahl weiterhin sichtbar bleiben, etwa als grau hinterlegte Notiz, oder komplett ausgeblendet werden
