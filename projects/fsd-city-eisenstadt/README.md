# FSD City Eisenstadt

Single-File-Browserspiel (`index.html`): Innenstadt Eisenstadt (Bounding Box 47.8395,16.5085,47.8555,16.5395)
im Look der Tesla-Cockpit-Umgebungsansicht, mit KI-Verkehr, Fußgängern, Autopilot und dem Roadster samt
Suction-Fans und Kaltgas-Düsen (Fahrlogik aus „Roadster Thruster: Starbase“).

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
