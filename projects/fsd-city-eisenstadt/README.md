# FSD City Eisenstadt

Single-File-Browserspiel (`index.html`, komplett eigenständig: three.js, GLTFLoader und Roadster-Modell eingebettet, läuft auch per Doppelklick offline): Innenstadt Eisenstadt (Bounding Box 47.8395,16.5085,47.8555,16.5395)
im Look der Tesla-Cockpit-Umgebungsansicht, mit KI-Verkehr, Fußgängern, Autopilot und dem Roadster samt
Suction-Fans und Kaltgas-Düsen (Fahrlogik aus „Roadster Thruster: Starbase“).

## Grafik

Zwei Ansichten (Taste V): **Realistisch** mit physikalischem Himmel und echtem Sonnenstand über Eisenstadt,
Tag/Nacht (Echtzeit oder Regler), Wolken, Regen mit nasser Fahrbahn, Echtzeit-Schatten, Umgebungsreflexionen,
Fassaden-Shader mit Fenstern je Stockwerk (nachts beleuchtet), Ziegeldächern aus OSM-Dachform/-farbe,
Kirchtürmen aus Gebäudeteilen, Bäumen mit Herbstlaub und Wind, Weinstöcken, Laternen mit Lichtkegeln und
SSAO/Bloom/Filmlook; Qualitätsstufen für Handys. **Cockpit-Visualisierung** wie bisher. Kamera C: Verfolger,
Draufsicht, frei, Kino.

## Autopilot

Entscheidet jeden Frame neu aus der aktuellen Lage: Objekte werden ins Routen-Koordinatensystem projiziert,
Vordermann, Stau (mit Ursache: Panne, Ampel, Kreuzung), Gegenverkehr und Fußgänger erkannt. Ein lokaler Planer
legt ein Querversatz-Profil fest (ausweichen, über die Gegenfahrbahn überholen, wieder einscheren), die
Längsregelung folgt den Hindernissen im geplanten Korridor. Pannen hinter der nächsten Kreuzung werden per
Umleitung umfahren. Wo das ohne Kaltgas nicht geht, schlägt er Kaltgas-Manöver vor (Sprung über den Stau,
Boost-Überholen) – mit Flugbahn, Kaltgas-Bedarf und Begründung – und führt sie erst nach Bestätigung aus.
Szenarien („Panne vor mir“, „Stau hinter Panne“) im Menü.

## KI-Modelle (lernen live im Browser)

Kleine neuronale Netze (MLP mit Adam, reines JavaScript) trainieren online aus dem laufenden Verkehr:
Abbiegeabsicht anderer Fahrzeuge (aus Blinker, Tempo, Verzögerung, Spur, Abstand), Querungsabsicht von
Fußgängern am Zebrastreifen (balanciert trainiert) und dein Fahrstil (Wunschtempo je Situation, Zeitabstand).
Der Autopilot nutzt die Vorhersagen statt internem Simulationswissen, sobald die laufend gemessene
Trefferquote reicht; vorhergesagte Pfade werden angezeigt. Gewichte bleiben im Browser gespeichert.

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
