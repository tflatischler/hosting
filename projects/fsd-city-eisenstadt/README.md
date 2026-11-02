# FSD City Eisenstadt

Single-File-Browserspiel (`index.html`, komplett eigenständig: three.js, GLTFLoader und Roadster-Modell eingebettet, läuft auch per Doppelklick offline): Innenstadt Eisenstadt (Bounding Box 47.8395,16.5085,47.8555,16.5395)
im Look der Tesla-Cockpit-Umgebungsansicht, mit KI-Verkehr, Fußgängern, Autopilot und dem Roadster samt
Suction-Fans und Kaltgas-Düsen (Fahrlogik aus „Roadster Thruster: Starbase“).

## Autopilot

Entscheidet jeden Frame neu aus der aktuellen Lage: Objekte werden ins Routen-Koordinatensystem projiziert,
Vordermann, Stau (mit Ursache: Panne, Ampel, Kreuzung), Gegenverkehr und Fußgänger erkannt. Ein lokaler Planer
legt ein Querversatz-Profil fest (ausweichen, über die Gegenfahrbahn überholen, wieder einscheren), die
Längsregelung folgt den Hindernissen im geplanten Korridor. Pannen hinter der nächsten Kreuzung werden per
Umleitung umfahren. Wo das ohne Kaltgas nicht geht, schlägt er Kaltgas-Manöver vor (Sprung über den Stau,
Boost-Überholen) – mit Flugbahn, Kaltgas-Bedarf und Begründung – und führt sie erst nach Bestätigung aus.
Szenarien („Panne vor mir“, „Stau hinter Panne“) im Menü.

## Stadtdaten

Die Seite holt sich die Daten in dieser Reihenfolge:

1. eingebettet in `index.html` (`<script id="cityData">`),
2. aus dem Browser-Cache (IndexedDB),
3. live von Overpass (der OSM→JSON-Konverter steckt in der HTML).

Daten vorab einbetten (Rohdaten werden unter `data/raw/` gecacht):

```bash
node projects/fsd-city-eisenstadt/tools/build-city.mjs
```

Die GitHub Action führt das vor jedem Deploy aus (schlägt es fehl, lädt die Seite zur Laufzeit).

Kartendaten © OpenStreetMap-Mitwirkende, ODbL.
