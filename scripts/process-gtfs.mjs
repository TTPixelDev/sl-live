
import path from 'path';
import fs from 'fs';
import yauzl from 'yauzl-promise';
import { parse } from 'csv-parse';
import process from 'process';

// --- Konfiguration ---
const DATA_DIR = path.resolve(process.cwd(), 'data/raw');
const ZIP_FILE = path.join(DATA_DIR, 'sweden.zip');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const OUT_DIR = path.join(PUBLIC_DIR, 'data');
const LINES_OUT_DIR = path.join(OUT_DIR, 'lines');

// Mycket viktigt: Agency ID:n enligt analysen
const AGENCIES = {
    '505000000000000001': 'SL',
    '500000000000000114': 'WAAB', // Waxholmsbolaget (registrerat som "114")
    '505000000000000606': 'WAAB'  // Fallback
};

// Optimering: Kapa koordinater till 5 decimaler (~1.1 meter precision) för att spara enormt med plats
const formatCoord = (n) => Number(Number(n).toFixed(5));

async function streamCsvFromEntry(entry, processRow, fileName) {
    if (!entry) throw new Error(`Filen ${fileName} saknas i zip-filen.`);
    const readStream = await entry.openReadStream();
    const parser = readStream.pipe(parse({
        columns: true,
        skip_empty_lines: true,
    }));
    for await (const row of parser) {
        processRow(row);
    }
}

async function processGTFS() {
    console.log('--- Startar Minnesoptimerad GTFS-bearbetning (SL + WÅAB) ---');

    if (!fs.existsSync(ZIP_FILE)) {
        console.error(`FEL: Hittar inte ${ZIP_FILE}`);
        process.exit(1);
    }

    if (fs.existsSync(LINES_OUT_DIR)) {
        fs.rmSync(LINES_OUT_DIR, { recursive: true, force: true });
    }
    [PUBLIC_DIR, OUT_DIR, LINES_OUT_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    const zipfile = await yauzl.open(ZIP_FILE);
    const entries = new Map();
    for await (const entry of zipfile) {
        entries.set(entry.filename, entry);
    }

    try {
        // [1] Rutter
        console.log('[1/5] Filtrerar rutter...');
        const validRouteIds = new Set();
        const routesData = new Map();
        await streamCsvFromEntry(entries.get('routes.txt'), (row) => {
            const agency = AGENCIES[row.agency_id];
            if (agency) {
                validRouteIds.add(row.route_id);
                row._app_agency = agency;
                routesData.set(row.route_id, row);
            }
        }, 'routes.txt');

        // [2] Resor (Hitta bästa turen per rutt direkt)
        console.log('[2/5] Kartlägger resor och väljer representativa turer...');
        const tripToRouteMap = new Map();
        const tripToShapeId = new Map();
        const routeToBestTrip = new Map(); // route_id -> trip_id
        const tripStopCounts = new Map();

        await streamCsvFromEntry(entries.get('trips.txt'), (row) => {
            if (validRouteIds.has(row.route_id)) {
                tripToRouteMap.set(row.trip_id, row.route_id);
                if (row.shape_id) tripToShapeId.set(row.trip_id, row.shape_id);
            }
        }, 'trips.txt');

        // Räkna stopp per trip för att välja den mest kompletta turen som representant för linjen
        await streamCsvFromEntry(entries.get('stop_times.txt'), (row) => {
            if (tripToRouteMap.has(row.trip_id)) {
                tripStopCounts.set(row.trip_id, (tripStopCounts.get(row.trip_id) || 0) + 1);
            }
        }, 'stop_times.txt');

        for (const [tripId, routeId] of tripToRouteMap.entries()) {
            const count = tripStopCounts.get(tripId) || 0;
            const currentBest = routeToBestTrip.get(routeId);
            if (!currentBest || count > (tripStopCounts.get(currentBest) || 0)) {
                routeToBestTrip.set(routeId, tripId);
            }
        }

        const selectedTripIds = new Set(routeToBestTrip.values());
        const selectedShapeIds = new Set();
        selectedTripIds.forEach(tid => {
            const sid = tripToShapeId.get(tid);
            if (sid) selectedShapeIds.add(sid);
        });

        // [3] Samla in stopp och tider för de utvalda turerna
        console.log('[3/5] Samlar data för utvalda resor...');
        const selectedTripStops = new Map(); // trip_id -> stop_id[]
        const neededStopIds = new Set();

        await streamCsvFromEntry(entries.get('stop_times.txt'), (row) => {
            if (selectedTripIds.has(row.trip_id)) {
                if (!selectedTripStops.has(row.trip_id)) selectedTripStops.set(row.trip_id, []);
                selectedTripStops.get(row.trip_id).push(row);
                neededStopIds.add(row.stop_id);
            }
        }, 'stop_times.txt');

        const stopsMap = new Map();
        await streamCsvFromEntry(entries.get('stops.txt'), (row) => {
            if (neededStopIds.has(row.stop_id)) {
                stopsMap.set(row.stop_id, {
                    id: row.stop_id,
                    name: row.stop_name,
                    lat: formatCoord(row.stop_lat),
                    lng: formatCoord(row.stop_lon)
                });
            }
        }, 'stops.txt');

        // [4] Stream shapes (Här sker ofta OOM - vi sparar bara minimal data)
        console.log('[4/5] Streamar former (Shapes)...');
        const finalShapesMap = new Map(); // shape_id -> [lat, lng, seq][]
        await streamCsvFromEntry(entries.get('shapes.txt'), (row) => {
            if (selectedShapeIds.has(row.shape_id)) {
                if (!finalShapesMap.has(row.shape_id)) finalShapesMap.set(row.shape_id, []);
                // Spara endast det nödvändiga för att spara minne
                finalShapesMap.get(row.shape_id).push({
                    lat: formatCoord(row.shape_pt_lat),
                    lng: formatCoord(row.shape_pt_lon),
                    seq: parseInt(row.shape_pt_sequence)
                });
            }
        }, 'shapes.txt');

        // [5] Export
        console.log('[5/5] Exporterar data...');
        const manifest = [];
        const tripToRouteIdJson = {};

        for (const [routeId, route] of routesData.entries()) {
            const tripId = routeToBestTrip.get(routeId);
            if (!tripId) continue;

            const stimes = (selectedTripStops.get(tripId) || [])
                .sort((a,b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
            
            const stops = stimes.map(st => {
                const s = stopsMap.get(st.stop_id);
                if (s) return { ...s, agency: route._app_agency };
                return null;
            }).filter(Boolean);

            if (stops.length < 2) continue;

            const shapeId = tripToShapeId.get(tripId);
            const pathPoints = (finalShapesMap.get(shapeId) || [])
                .sort((a,b) => a.seq - b.seq)
                .map(p => [p.lat, p.lng]);

            const lineData = {
                id: routeId,
                line: route.route_short_name || route.route_long_name,
                agency: route._app_agency,
                path: pathPoints.length > 0 ? pathPoints : stops.map(s => [s.lat, s.lng]),
                stops: stops
            };

            fs.writeFileSync(path.join(LINES_OUT_DIR, `${routeId}.json`), JSON.stringify(lineData));
            
            manifest.push({
                id: routeId,
                line: lineData.line,
                from: stops[0].name,
                to: stops[stops.length-1].name,
                agency: route._app_agency
            });
        }

        // Spara globala filer
        fs.writeFileSync(path.join(OUT_DIR, 'stops.json'), JSON.stringify(Array.from(stopsMap.values())));
        fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));
        
        // Realtidsmappning - hämta alla trips igen för att ha komplett realtidskoll
        console.log('Skapar realtidsmappning...');
        await streamCsvFromEntry(entries.get('trips.txt'), (row) => {
            if (validRouteIds.has(row.route_id)) {
                tripToRouteIdJson[row.trip_id] = { r: row.route_id };
            }
        }, 'trips.txt');
        fs.writeFileSync(path.join(OUT_DIR, 'trip-to-route.json'), JSON.stringify(tripToRouteIdJson));

        console.log(`✅ Bearbetning klar! ${manifest.length} linjer sparade.`);
    } finally {
        await zipfile.close();
    }
}
processGTFS();
