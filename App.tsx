
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import SearchBar from './components/SearchBar';
import VehiclePopup from './components/VehiclePopup';
import VehicleSearch from './components/VehicleSearch';
import { slService, LineManifestEntry } from './services/slService';
import { SLVehicle, SLLineRoute, SearchResult, SLStop, HistoryPoint } from './types';
import { RefreshCw, Ship, Clock, Timer } from 'lucide-react';

// Fix för Leaflet ikoner
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DEFAULT_VIEW: { center: [number, number]; zoom: number; bounds?: L.LatLngBoundsExpression } = {
  center: [59.3293, 18.0686],
  zoom: 12,
  bounds: undefined
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

interface VehicleMarkerProps {
  vehicle: SLVehicle;
  lineShortName: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDeselect: () => void;
}

const VehicleMarker: React.FC<VehicleMarkerProps> = ({ vehicle, lineShortName, isSelected, onSelect, onDeselect }) => {
  const markerRef = useRef<L.Marker>(null);
  
  const icon = useMemo(() => {
    const color = vehicle.agency === 'WAAB' ? '#0891b2' : '#3B82F6';
    return L.divIcon({
        className: 'custom-vehicle-icon',
        html: `
          <div style="transform: rotate(${vehicle.bearing}deg); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; position: relative;">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
              <path d="M12 2L4 21L12 17L20 21L12 2Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
            </svg>
            <div style="position: absolute; top: -15px; left: 50%; transform: translateX(-50%) rotate(${-vehicle.bearing}deg); background: ${color}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 800; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              ${lineShortName}
            </div>
          </div>
        `, iconSize: [34, 34], iconAnchor: [17, 17]
      });
  }, [vehicle.bearing, lineShortName, vehicle.agency]);

  useEffect(() => {
    if (markerRef.current) {
        if (isSelected) {
            if (!markerRef.current.isPopupOpen()) markerRef.current.openPopup();
        } else {
            if (markerRef.current.isPopupOpen()) markerRef.current.closePopup();
        }
    }
  }, [isSelected, vehicle.lat, vehicle.lng]);

  return (
    <Marker 
      ref={markerRef} 
      position={[vehicle.lat, vehicle.lng]} 
      icon={icon} 
      eventHandlers={{ 
        click: () => onSelect(vehicle.id), 
        popupclose: () => { if (isSelected) onDeselect(); }
      }}
    >
      <Popup className="custom-popup" autoPan={false} closeButton={true}>
        <VehiclePopup vehicle={vehicle} lineShortName={lineShortName} />
      </Popup>
    </Marker>
  );
};

const MapController = ({ center, zoom, bounds }: { center: [number, number]; zoom: number; bounds?: L.LatLngBoundsExpression }) => {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [50, 50] }); else map.setView(center, zoom); }, [center, zoom, bounds, map]);
  return null;
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<'SL' | 'WAAB'>('SL');
  const [vehicles, setVehicles] = useState<SLVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<SLLineRoute | null>(null);
  const [activeStop, setActiveStop] = useState<SLStop | null>(null);
  const [mapConfig, setMapConfig] = useState(DEFAULT_VIEW);
  const [routeManifest, setRouteManifest] = useState<Map<string, LineManifestEntry>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    (async () => {
      await slService.initialize();
      const m = await slService.getManifest();
      setRouteManifest(new Map(m.map(x => [x.id, x])));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const fetch = async () => setVehicles(await slService.getLiveVehicles(agency));
    fetch();
    const i = setInterval(fetch, 5000);
    return () => clearInterval(i);
  }, [loading, agency]);

  useEffect(() => {
    if (selectedVehicleId) {
        const v = vehicles.find(x => x.id === selectedVehicleId);
        if (v) {
            slService.getVehicleHistory(v.tripId).then(setHistory);
            if (!activeRoute || activeRoute.id !== v.line) {
                slService.getLineRoute(v.line).then(r => {
                    if (r) setActiveRoute(r);
                });
            }
        }
    } else {
        setHistory([]);
    }
  }, [selectedVehicleId, vehicles]);

  const stopPassages = useMemo(() => {
    if (!activeRoute || history.length === 0) return new Map();
    const passages = new Map<string, { time: string, stopped: boolean, duration?: string }>();
    
    activeRoute.stops.forEach(stop => {
        // Ökad sökradie till 100m för att pålitligt fånga upp hållplatser med 5s GPS-jitter
        const nearbyPoints = history.filter(p => getDistance(p.lat, p.lng, stop.lat, stop.lng) < 100);
        
        if (nearbyPoints.length > 0) {
            nearbyPoints.sort((a, b) => a.ts - b.ts);
            const first = nearbyPoints[0];
            const last = nearbyPoints[nearbyPoints.length - 1];
            
            const durationMs = last.ts - first.ts;
            const durationSec = Math.round(durationMs / 1000);
            
            const arrivalTime = new Date(first.ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
            
            let durationStr = "";
            // Krav: Stoppet måste ha varat i minst 10 sekunder (minst 2 loggade punkter i rad)
            const isActuallyStopped = durationSec >= 10;

            if (isActuallyStopped) {
                const mins = Math.floor(durationSec / 60);
                const secs = durationSec % 60;
                durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            }

            passages.set(stop.id, {
                time: arrivalTime,
                stopped: isActuallyStopped,
                duration: durationStr
            });
        }
    });
    return passages;
  }, [activeRoute, history]);

  const handleClear = () => { 
    setActiveRoute(null); 
    setActiveStop(null); 
    setSelectedVehicleId(null); 
    setMapConfig(DEFAULT_VIEW); 
    setSearchQuery(''); 
  };

  const handleSelect = async (res: SearchResult) => {
    // STÄNG ALLA ÖPPNA POPUPS VID NY SÖKNING
    setSelectedVehicleId(null);
    setHistory([]);
    
    if (res.type === 'line') {
        const r = await slService.getLineRoute(res.id);
        if (r) { 
            setActiveRoute(r); 
            setActiveStop(null); 
            const b = L.latLngBounds(r.path); 
            setMapConfig({ center: [b.getCenter().lat, b.getCenter().lng], zoom: 12, bounds: b }); 
        }
    } else {
        const s = await slService.getStopInfo(res.id);
        if (s) { 
            setActiveStop(s); 
            setMapConfig({ center: [s.lat, s.lng], zoom: 14 }); 
        }
    }
  };

  if (loading) return <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white"><RefreshCw className="w-12 h-12 animate-spin text-blue-500 mb-4" />Laddar trafikdata...</div>;

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-4 left-4 z-[2000] bg-slate-900/90 backdrop-blur p-1 rounded-xl shadow-2xl flex border border-white/10">
        <button onClick={() => { setAgency('SL'); handleClear(); }} className={`px-4 py-2 rounded-lg text-xs font-bold transition ${agency === 'SL' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>SL</button>
        <button onClick={() => { setAgency('WAAB'); handleClear(); }} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${agency === 'WAAB' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}><Ship className="w-4 h-4" /> WÅAB</button>
      </div>

      <SearchBar 
        onSelect={handleSelect} 
        onClear={handleClear} 
        activeRoute={activeRoute} 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
        currentAgency={agency} 
        stopPassages={stopPassages}
      />

      <div className="absolute bottom-6 left-6 right-6 z-[1000] flex justify-between items-end pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur p-4 rounded-2xl shadow-2xl border border-white/10 pointer-events-auto min-w-[220px]">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Live Status
            </div>
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-300">Fordon i trafik</span>
                    <span className="text-xs text-white font-bold bg-slate-800 px-2 py-0.5 rounded">{vehicles.length}</span>
                </div>
                <div className="flex items-center justify-between gap-8 pt-2 border-t border-white/5">
                    <span className="text-xs text-slate-300">Visa all trafik</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="sr-only peer" />
                        <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>
        </div>
        <div className="pointer-events-auto">
            <VehicleSearch onVehicleFound={(v) => {
              setSelectedVehicleId(null);
              setTimeout(() => setSelectedVehicleId(v.id), 50);
            }} />
        </div>
      </div>

      <MapContainer center={mapConfig.center} zoom={mapConfig.zoom} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <MapController center={mapConfig.center} zoom={mapConfig.zoom} bounds={mapConfig.bounds} />
        
        {activeRoute && <Polyline positions={activeRoute.path} color={agency === 'WAAB' ? "#0891b2" : "#3b82f6"} weight={6} opacity={0.6} />}
        
        {activeRoute?.stops.map(s => {
            const passage = stopPassages.get(s.id);
            // GRÖN (#10b981) om fordonet stannat
            // GUL (#f59e0b) om fordonet passerat utan att stå still 10s
            // VIT (#ffffff) om fordonet ej varit där än (kommande hållplats)
            const markerFill = passage ? (passage.stopped ? "#10b981" : "#f59e0b") : "#ffffff";
            
            
            return (
                <CircleMarker 
                    key={s.id} 
                    center={[s.lat, s.lng]} 
                    radius={passage ? 8 : 4.5} 
                    fillColor={markerFill}
                    fillOpacity={1} 
                    color={agency === 'WAAB' ? "#0891b2" : "#3b82f6"} 
                    weight={2} 
                    eventHandlers={{ click: () => setActiveStop(s) }}
                >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.9} className="custom-tooltip">
                        <div className="p-1 font-sans">
                            <div className="text-xs font-bold text-slate-900">{s.name}</div>
                            {passage ? (
                                <div className="mt-1 flex flex-col gap-0.5">
                                    <div className={`flex items-center gap-1.5 text-[10px] font-bold ${passage.stopped ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        <Clock className="w-3 h-3" />
                                        {passage.stopped ? 'Stannade' : 'Passerade'} {passage.time}
                                    </div>
                                    {passage.duration && (
                                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold pl-4">
                                            <Timer className="w-2.5 h-2.5" />
                                            Stod stilla i {passage.duration}
                                        </div>
                                    )}
                                </div>
                            ) : selectedVehicleId ? (
                                <div className="mt-1 text-[9px] text-slate-400 font-bold italic">Kommande hållplats</div>
                            ) : null}
                        </div>
                    </Tooltip>
                </CircleMarker>
            );
        })}

        {activeStop && <Marker position={[activeStop.lat, activeStop.lng]}><Popup>{activeStop.name}</Popup></Marker>}
        
        {history.length > 1 && (
            <Polyline 
                positions={history.map(p => [p.lat, p.lng])} 
                color="#ef4444" 
                weight={3} 
                dashArray="5, 10" 
                opacity={0.8}
            />
        )}
        
        {vehicles.filter(v => showAll || (activeRoute && v.line === activeRoute.id) || selectedVehicleId === v.id).map(v => (
            <VehicleMarker 
                key={v.id} 
                vehicle={v} 
                lineShortName={routeManifest.get(v.line)?.line || '?'} 
                isSelected={selectedVehicleId === v.id} 
                onSelect={setSelectedVehicleId} 
                onDeselect={() => setSelectedVehicleId(null)} 
            />
        ))}
      </MapContainer>
    </div>
  );
};

export default App;
