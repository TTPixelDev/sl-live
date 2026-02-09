import React, { useState, useEffect, useRef } from 'react';
import { Search, Bus, MapPin, X, Train, Ship, TramFront, TrainFront, Clock, CheckCircle2, Map as MapIcon, XCircle, Timer } from 'lucide-react';
import { slService } from '../services/slService';
import { SearchResult, SLLineRoute } from '../types';

interface SearchBarProps {
  onSelect: (result: SearchResult) => void;
  onClear: () => void;
  activeRoute: SLLineRoute | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  currentAgency: 'SL' | 'WAAB';
  stopPassages?: Map<string, { time: string, stopped: boolean, duration?: string }>;
}

const getTransportIcon = (lineString: string, agency?: 'SL' | 'WAAB') => {
  if (agency === 'WAAB') return <Ship className="w-5 h-5 text-white" />;
  const lineName = lineString.replace('Linje ', '').trim();
  if (/[a-zA-Z]/.test(lineName)) return <Bus className="w-5 h-5 text-white" />;
  const num = parseInt(lineName);
  if (isNaN(num)) return <Bus className="w-5 h-5 text-white" />;
  if ([10, 11, 13, 14, 17, 18, 19].includes(num)) return <TrainFront className="w-5 h-5 text-white" />;
  if ([7, 12, 30, 31, 21, 25, 26, 27, 28, 29].includes(num)) return <TramFront className="w-5 h-5 text-white" />;
  if ([40, 41, 42, 43, 44, 48].includes(num)) return <Train className="w-5 h-5 text-white" />;
  if ([80, 82, 83, 84, 89].includes(num)) return <Ship className="w-5 h-5 text-white" />;
  return <Bus className="w-5 h-5 text-white" />;
};

const getLineColorClass = (lineString: string, agency?: string) => {
  if (agency === 'WAAB') return 'bg-cyan-600';
  const lineName = lineString.replace('Linje ', '').trim();
  const num = parseInt(lineName);
  
  const blueBusLines = [1, 2, 3, 4, 5, 6, 172, 173, 176, 177, 178, 179, 471, 474, 670, 676, 677, 873, 875];
  if (!isNaN(num) && blueBusLines.includes(num)) return 'bg-blue-600';
  
  const redBusLines = ![10, 11, 13, 14, 17, 18, 19, 7, 12, 30, 31, 21, 25, 26, 27, 28, 29, 40, 41, 42, 43, 44, 48, 80, 82, 83, 84, 89].includes(num);
  if (!isNaN(num) && redBusLines) return 'bg-red-600';
  
  if ([10, 11].includes(num)) return 'bg-blue-700'; // Blå linje
  if ([13, 14].includes(num)) return 'bg-red-600'; // Röd linje
  if ([17, 18, 19].includes(num)) return 'bg-green-600'; // Grön linje
  if ([40, 41, 42, 43, 44, 48].includes(num)) return 'bg-pink-500'; // Pendeltåg
  if (num === 7) return 'bg-gray-600';
  if (num === 12) return 'bg-slate-600';
  if (num === 21) return 'bg-amber-700';
  if ([30, 31].includes(num)) return 'bg-orange-600';
  if ([25, 26].includes(num)) return 'bg-teal-600';
  if ([27, 28, 29].includes(num)) return 'bg-purple-600';
  if ([80, 82, 83, 84, 89].includes(num)) return 'bg-cyan-600';
  
  return 'bg-blue-600';
};

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSelect, 
  onClear, 
  activeRoute, 
  searchQuery, 
  onSearchChange,
  placeholder = "Sök linje eller hållplats...",
  currentAgency,
  stopPassages
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);

  useEffect(() => {
    const fetchResults = async () => {
      const q = searchQuery.trim();
      if (q.length > 0) {
        const globalResults = await slService.search(q, currentAgency);
        const lineResults = globalResults.filter(r => r.type === 'line');

        if (activeRoute) {
            const filteredStops = activeRoute.stops
                .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
                .slice(0, 10)
                .map(s => ({
                    type: 'stop' as const,
                    id: s.id,
                    title: s.name,
                    subtitle: `På linje ${activeRoute.line}`,
                    agency: activeRoute.agency
                }));
            
            setResults([...lineResults, ...filteredStops]);
        } else {
            setResults(globalResults);
        }
        
        if (!isSelectingRef.current) setShowDropdown(true);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    };
    fetchResults();
  }, [searchQuery, currentAgency, activeRoute]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-md px-4 flex flex-col gap-3">
      <div className="relative bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center px-4 py-3.5 gap-3">
          <Search className="w-5 h-5 text-zinc-400" />
          <input
            type="text"
            className="flex-1 bg-transparent text-white outline-none placeholder:text-zinc-500 text-sm font-medium"
            placeholder={activeRoute ? `Sök hållplats på linje ${activeRoute.line} eller byt linje...` : placeholder}
            value={searchQuery}
            onChange={(e) => {
              isSelectingRef.current = false;
              onSearchChange(e.target.value);
            }}
            onFocus={() => { if (searchQuery.length > 0) setShowDropdown(true); }}
          />
          {searchQuery && (
            <button 
              onClick={() => { onSearchChange(''); }}
              className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {showDropdown && results.length > 0 && (
          <div className="border-t border-white/5 max-h-[60vh] overflow-y-auto">
            {results.map((result) => {
              const passage = stopPassages?.get(result.id);
              const iconContainerColor = result.type === 'line' ? 'bg-blue-500/10' : 'bg-emerald-500/10';
              const TransportIcon = result.type === 'line' ? getTransportIcon(result.title, result.agency) : <MapPin className="w-5 h-5 text-emerald-500" />;

              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => {
                    isSelectingRef.current = true;
                    onSelect(result);
                    setShowDropdown(false);
                    onSearchChange('');
                  }}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-white/[0.02] last:border-0"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`p-2.5 rounded-xl ${iconContainerColor} flex items-center justify-center`}>
                      {result.type === 'line' ? 
                        React.cloneElement(TransportIcon as React.ReactElement, { className: 'w-5 h-5 text-blue-400' }) : 
                        TransportIcon
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{result.title}</div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{result.subtitle}</div>
                    </div>
                  </div>
                  {passage && (
                    <div className="text-right flex flex-col items-end gap-0.5 shrink-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            {passage.stopped ? 'Stannade' : 'Passerade'} {passage.time}
                        </div>
                        {passage.duration && (
                            <div className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold">
                                <Timer className="w-2.5 h-2.5" />
                                Stopptid: {passage.duration}
                            </div>
                        )}
                        {!passage.duration && !passage.stopped && (
                            <XCircle className="w-3.5 h-3.5 text-amber-500 opacity-60" />
                        )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeRoute && !searchQuery && (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className={`flex-1 ${getLineColorClass(activeRoute.line, activeRoute.agency)} shadow-xl rounded-xl px-4 py-3 flex items-center gap-3 border border-white/20`}>
                <div className="shrink-0 flex items-center justify-center">
                    {getTransportIcon(activeRoute.line, activeRoute.agency)}
                </div>
                <span className="text-sm font-bold text-white truncate">
                    {activeRoute.line}: {activeRoute.stops[0].name} – {activeRoute.stops[activeRoute.stops.length-1].name}
                </span>
            </div>
            <button 
                onClick={onClear}
                className="bg-white/95 backdrop-blur hover:bg-white text-slate-800 p-3 rounded-xl shadow-xl transition-all active:scale-95 border border-black/5 shrink-0"
            >
                <X className="w-5 h-5" />
            </button>
        </div>
      )}
    </div>
  );
};

export default SearchBar;