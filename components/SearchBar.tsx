
import React, { useState, useEffect, useRef } from 'react';
import { Search, Bus, MapPin, X, Train, Ship, TramFront, TrainFront, Clock, Timer, Building2 } from 'lucide-react';
import { slService } from '../services/slService';
import { SearchResult, SLLineRoute } from '../types';

interface SearchBarProps {
  onSelect: (result: SearchResult) => void;
  onClear: () => void;
  activeRoute: SLLineRoute | null; // Finns kvar i interfacet men används inte visuellt i komponenten längre
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  currentAgency: 'SL' | 'WAAB';
  stopPassages?: Map<string, { time: string, stopped: boolean, duration?: string }>;
  operatorName?: string | null;
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

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSelect, 
  onClear, 
  activeRoute, 
  searchQuery, 
  onSearchChange,
  placeholder = "Sök linje eller hållplats...",
  currentAgency,
  stopPassages,
  operatorName
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
        // Filtrera bort linjer som redan är valda om activeRoute används? 
        // För enkelhetens skull visar vi alla resultat så användaren ser vad som matchar.
        setResults(globalResults);
        if (!isSelectingRef.current) setShowDropdown(true);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    };
    fetchResults();
  }, [searchQuery, currentAgency]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results.length > 0 && showDropdown) {
      e.preventDefault();
      const topResult = results[0];
      isSelectingRef.current = true;
      onSelect(topResult);
      setShowDropdown(false);
      onSearchChange('');
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-3 w-full">
      <div className="relative bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center px-4 py-3 gap-3">
          <Search className="w-5 h-5 text-slate-400" />
          <div className="flex-1 bg-slate-800/50 rounded-xl px-3 py-2 border border-white/5 focus-within:border-blue-500/30 transition-all flex items-center gap-2">
            <input
              type="text"
              className="flex-1 bg-transparent text-white outline-none placeholder:text-slate-500 text-sm font-medium"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => {
                isSelectingRef.current = false;
                onSearchChange(e.target.value);
              }}
              onFocus={() => { if (searchQuery.length > 0) setShowDropdown(true); }}
              onKeyDown={handleKeyDown}
            />
            {searchQuery && (
              <button onClick={() => { onSearchChange(''); }} className="p-1 hover:bg-slate-700 rounded-full transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {showDropdown && results.length > 0 && (
          <div className="border-t border-white/5 max-h-[60vh] overflow-y-auto bg-slate-900/40">
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
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left border-b border-white/[0.02] last:border-0 group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`p-2.5 rounded-xl ${iconContainerColor} flex items-center justify-center transition-colors group-hover:bg-opacity-20`}>
                      {result.type === 'line' ? 
                        React.cloneElement(TransportIcon as React.ReactElement<any>, { className: 'w-5 h-5 text-blue-400' }) : 
                        TransportIcon
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{result.title}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{result.subtitle}</div>
                    </div>
                  </div>
                  {passage && (
                    <div className="text-right flex flex-col items-end gap-0.5 shrink-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded-lg">
                            <Clock className="w-3.5 h-3.5" />
                            {passage.stopped ? 'Stannade' : 'Passerade'} {passage.time}
                        </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
