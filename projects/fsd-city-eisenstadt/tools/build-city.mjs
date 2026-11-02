#!/usr/bin/env node
// Lädt die OSM-Daten der Eisenstadt-Innenstadt per Overpass, cacht sie unter data/raw/,
// wandelt sie mit demselben Konverter wie das Spiel (aus index.html) in kompaktes JSON um
// und bettet das Ergebnis in index.html ein (<script id="cityData">).
//
//   node projects/fsd-city-eisenstadt/tools/build-city.mjs            # Cache nutzen, sonst laden; einbetten
//   node projects/fsd-city-eisenstadt/tools/build-city.mjs --refresh  # Overpass immer neu abfragen
//   node projects/fsd-city-eisenstadt/tools/build-city.mjs --no-embed # nur data/eisenstadt.city.json schreiben
//   node projects/fsd-city-eisenstadt/tools/build-city.mjs --clear    # eingebettete Daten wieder entfernen
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'index.html');
const RAW = join(ROOT, 'data', 'raw', 'overpass-eisenstadt.json');
const OUT = join(ROOT, 'data', 'eisenstadt.city.json');
const args = new Set(process.argv.slice(2));
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const EMBED_RE = /(<script type="application\/json" id="cityData">)([\s\S]*?)(<\/script>)/;

const html = await readFile(HTML, 'utf8');
if (args.has('--clear')) {
  await writeFile(HTML, html.replace(EMBED_RE, '$1$3'));
  console.log('Eingebettete Stadtdaten entfernt.');
  process.exit(0);
}

// Konverter aus der HTML holen – eine einzige Quelle für Browser und Build
const m = html.match(/\/\*CONVERTER-BEGIN\*\/([\s\S]*?)\/\*CONVERTER-END\*\//);
if (!m) throw new Error('Konverter-Block in index.html nicht gefunden');
const module = { exports: {} };
new Function('module', m[1])(module);
const FSDConvert = module.exports;

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

let raw;
if (!args.has('--refresh') && await exists(RAW)) {
  console.log('Rohdaten aus Cache:', RAW);
  raw = JSON.parse(await readFile(RAW, 'utf8'));
} else {
  for (const url of ENDPOINTS) {
    process.stdout.write(`Overpass ${new URL(url).host} … `);
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(FSDConvert.QUERY),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'fsd-city-eisenstadt/1.0 (static site build)' },
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok) { console.log('HTTP', r.status); continue; }
      const j = await r.json();
      if (!j.elements?.length) { console.log('leer'); continue; }
      console.log(j.elements.length, 'Elemente');
      raw = j; break;
    } catch (e) { console.log('Fehler:', e.message); }
  }
  if (!raw) { console.error('Kein Overpass-Server erreichbar.'); process.exit(1); }
  await mkdir(dirname(RAW), { recursive: true });
  await writeFile(RAW, JSON.stringify(raw));
  console.log('Rohdaten gecacht:', RAW);
}

const city = FSDConvert.convert(raw, s => console.log('  ' + s));
const json = JSON.stringify(city);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, json);
console.log(`Kompaktes JSON: ${OUT} (${(json.length / 1024).toFixed(0)} KB)`);

if (!args.has('--no-embed')) {
  const safe = json.replace(/<\//g, '<\\/');
  await writeFile(HTML, html.replace(EMBED_RE, (_, a, __, c) => a + safe + c));
  console.log('In index.html eingebettet.');
}
