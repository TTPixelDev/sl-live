
import { SLStop, SLLineRoute, SearchResult, SLVehicle, HistoryPoint } from '../types';
// @ts-ignore
import protobuf from 'protobufjs';

const DB_NAME = 'SL_Tracker_DB_v6';
const DB_VERSION = 1;
const STATIC_TS_KEY = 'sl_static_timestamp_v6';
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 7; 

const RT_VEHICLE_URL = '/api/gtfs-rt';
const RT_TRIP_UPDATES_URL = '/api/trip-updates';

export interface LineManifestEntry {
    id: string;
    line: string;
    description?: string;
    from: string;
    to: string;
    agency: 'SL' | 'WAAB';
}

interface TripMapEntry {
  r: string; // route_id
  h?: string; // headsign
}

class SLService {
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private rtRoot: any = null;
  private tripToRouteMap: Record<string, TripMapEntry> | null = null;
  private stopsMap: Map<string, string> = new Map();
  private manifest: LineManifestEntry[] = [];

  public areKeysConfigured(): boolean { return true; }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains('stops')) db.deleteObjectStore('stops');
        if (db.objectStoreNames.contains('routes')) db.deleteObjectStore('routes');
        db.createObjectStore('stops', { keyPath: 'id' }).createIndex('name', 'name');
        db.createObjectStore('routes', { keyPath: 'id' }).createIndex('line', 'line');
      };
      request.onsuccess = () => { this.db = request.result; resolve(this.db); };
      request.onerror = () => reject(request.error);
    });
  }
  
  async initialize() {
    if (this.isInitialized) return;
    await this.getDB();
    const lastUpdate = localStorage.getItem(STATIC_TS_KEY);
    if (!lastUpdate || (Date.now() - parseInt(lastUpdate)) > CACHE_DURATION) {
      await this.loadStaticDataFromFiles();
    } else {
      await this.loadStopsFromDB();
      this.manifest = await this.getManifestFromDB();
    }
    await this.loadAuxiliaryMaps();
    this.isInitialized = true;
  }

  async getManifest(): Promise<LineManifestEntry[]> {
    await this.initialize();
    return this.manifest;
  }

  private async loadAuxiliaryMaps() {
    try {
        const tripRes = await fetch(`/data/trip-to-route.json?v=${Date.now()}`);
        if (tripRes.ok) this.tripToRouteMap = await tripRes.json();
    } catch(e) { console.warn("Hjälpkartor saknas."); }
  }

  private async loadStopsFromDB() {
      const db = await this.getDB();
      const tx = db.transaction('stops', 'readonly');
      const req = tx.objectStore('stops').getAll();
      req.onsuccess = () => { if (req.result) req.result.forEach((s: SLStop) => this.stopsMap.set(s.id, s.name)); };
  }

  private async getManifestFromDB(): Promise<LineManifestEntry[]> {
    const db = await this.getDB();
    return new Promise(resolve => {
        const req = db.transaction('routes', 'readonly').objectStore('routes').getAll();
        req.onsuccess = () => resolve(req.result);
    });
  }

  private async loadStaticDataFromFiles() {
    try {
      const [manifestRes, stopsRes] = await Promise.all([fetch('/data/manifest.json'), fetch('/data/stops.json')]);
      this.manifest = await manifestRes.json();
      const stops: SLStop[] = await stopsRes.json();
      stops.forEach(s => this.stopsMap.set(s.id, s.name));

      const db = await this.getDB();
      const tx = db.transaction(['stops', 'routes'], 'readwrite');
      stops.forEach(s => tx.objectStore('stops').put(s));
      this.manifest.forEach((r: LineManifestEntry) => tx.objectStore('routes').put(r));
      localStorage.setItem(STATIC_TS_KEY, Date.now().toString());
    } catch (e) { console.error("Kunde inte ladda data."); }
  }
  
  async search(query: string, currentAgency: 'SL' | 'WAAB'): Promise<SearchResult[]> {
    await this.initialize();
    if (query.trim().length < 1) return [];
    const q = query.toLowerCase();
    const db = await this.getDB();

    return new Promise(resolve => {
        const results: SearchResult[] = [];
        const tx = db.transaction(['routes', 'stops'], 'readonly');
        
        tx.objectStore('routes').openCursor().onsuccess = (e) => {
            const cursor = (e.target as any).result;
            if (cursor) {
                const r = cursor.value as LineManifestEntry;
                if (r.line.toLowerCase().startsWith(q) && r.agency === currentAgency) {
                    results.push({ type: 'line', id: r.id, title: `Linje ${r.line}`, subtitle: `${r.from} - ${r.to}`, agency: r.agency });
                }
                cursor.continue();
            } else {
                tx.objectStore('stops').openCursor().onsuccess = (e2) => {
                    const c2 = (e2.target as any).result;
                    if (c2 && results.length < 15) {
                        const s = c2.value as SLStop;
                        const stopAgency = s.agency || 'SL';
                        if (s.name.toLowerCase().includes(q) && stopAgency === currentAgency) {
                            results.push({ type: 'stop', id: s.id, title: s.name, subtitle: currentAgency === 'WAAB' ? 'Brygga' : 'Hållplats', agency: stopAgency });
                        }
                        c2.continue();
                    } else resolve(results);
                };
            }
        };
    });
  }

  async getLineRoute(routeId: string): Promise<SLLineRoute | null> {
    const res = await fetch(`/data/lines/${routeId}.json`);
    if (!res.ok) return null;
    return await res.json();
  }

  async getStopInfo(stopId: string): Promise<SLStop | null> {
    const db = await this.getDB();
    return new Promise(resolve => {
      const req = db.transaction('stops', 'readonly').objectStore('stops').get(stopId);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async getLiveVehicles(currentAgency?: 'SL' | 'WAAB'): Promise<SLVehicle[]> {
    await this.initialize();
    try {
        // Hämta både positioner och förseningar parallellt
        const [posRes, updatesRes] = await Promise.all([
          fetch(RT_VEHICLE_URL),
          fetch(RT_TRIP_UPDATES_URL)
        ]);

        const [posBuffer, updatesBuffer] = await Promise.all([
          posRes.arrayBuffer(),
          updatesRes.arrayBuffer()
        ]);

        const root = await this.getRTRoot();
        const FeedMessage = root.lookupType("transit_realtime.FeedMessage");
        
        const posMessage = FeedMessage.decode(new Uint8Array(posBuffer));
        const posObject = FeedMessage.toObject(posMessage, { enums: String, longs: String });

        const updatesMessage = FeedMessage.decode(new Uint8Array(updatesBuffer));
        const updatesObject = FeedMessage.toObject(updatesMessage, { enums: String, longs: String });

        // Mappa tripId -> delay
        const delays: Record<string, number> = {};
        (updatesObject.entity || []).forEach((e: any) => {
            if (e.tripUpdate && e.tripUpdate.trip) {
                const tId = e.tripUpdate.trip.tripId;
                const stu = e.tripUpdate.stopTimeUpdate;
                if (stu && stu.length > 0) {
                    const first = stu[0];
                    if (first.arrival?.delay !== undefined) delays[tId] = first.arrival.delay;
                    else if (first.departure?.delay !== undefined) delays[tId] = first.departure.delay;
                }
            }
        });
        
        const vehicles: SLVehicle[] = [];
        for (const entity of (posObject.entity || [])) {
            const v = entity.vehicle;
            if (!v || !v.trip || !v.position) continue;
            const tripId = v.trip.tripId || v.trip.trip_id;
            const mapInfo = this.tripToRouteMap?.[tripId];
            if (!mapInfo) continue;

            const routeId = mapInfo.r;
            const routeManifest = this.manifest.find(m => m.id === routeId);
            if (!routeManifest) continue;

            if (currentAgency && routeManifest.agency !== currentAgency) continue;

            vehicles.push({
                id: v.vehicle?.id || entity.id,
                line: routeId,
                tripId: tripId,
                operator: routeManifest.agency === 'WAAB' ? "Blidösundsbolaget" : "SL",
                vehicleNumber: v.vehicle?.label || v.vehicle?.id?.slice(-4) || "N/A",
                lat: v.position.latitude,
                lng: v.position.longitude,
                bearing: v.position.bearing || 0,
                speed: (v.position.speed || 0) * 3.6,
                destination: mapInfo.h || "Okänd",
                type: routeManifest.agency === 'WAAB' ? 'Färja' : 'Buss',
                agency: routeManifest.agency,
                delay: delays[tripId]
            });
        }
        return vehicles;
    } catch(e) { 
        console.error("Fel vid hämtning av realtidsdata:", e);
        return []; 
    }
  }

  async findVehicle(vNum: string): Promise<{vehicle: SLVehicle, routeId: string} | null> {
    const all = await this.getLiveVehicles();
    const found = all.find(v => v.vehicleNumber === vNum || v.id.endsWith(vNum));
    return found ? { vehicle: found, routeId: found.line } : null;
  }

  async getVehicleHistory(tripId: string): Promise<HistoryPoint[]> {
      const res = await fetch(`/api/history?tripId=${tripId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.path || [];
  }

  private async getRTRoot() {
    if (this.rtRoot) return this.rtRoot;
    this.rtRoot = await protobuf.parse(`
      syntax = "proto2";
      package transit_realtime;
      message FeedMessage { required FeedHeader header = 1; repeated FeedEntity entity = 2; }
      message FeedHeader { required string gtfs_realtime_version = 1; optional uint64 timestamp = 3; }
      message FeedEntity { required string id = 1; optional VehiclePosition vehicle = 4; optional TripUpdate trip_update = 3; }
      message VehiclePosition { optional TripDescriptor trip = 1; optional VehicleDescriptor vehicle = 8; optional Position position = 2; }
      message TripUpdate { optional TripDescriptor trip = 1; repeated StopTimeUpdate stop_time_update = 2; }
      message StopTimeUpdate { optional uint32 stop_sequence = 1; optional string stop_id = 4; optional StopTimeEvent arrival = 2; optional StopTimeEvent departure = 3; }
      message StopTimeEvent { optional int32 delay = 1; optional int64 time = 2; }
      message TripDescriptor { optional string trip_id = 1; optional string route_id = 5; }
      message VehicleDescriptor { optional string id = 1; optional string label = 2; }
      message Position { required float latitude = 1; required float longitude = 2; optional float bearing = 3; optional float speed = 5; }
    `).root;
    return this.rtRoot;
  }
}
export const slService = new SLService();
