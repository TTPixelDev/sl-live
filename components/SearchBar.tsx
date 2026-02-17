
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, MapPin, Bus, Ship, Train, TramFront, TrainFront } from 'lucide-react';
import { slService } from '../services/slService';
import { SearchResult, SLLineRoute } from '../types';

interface SearchBarProps {
  onSelect: (res: SearchResult) => void;
  onClear: () => void;
  activeRoute: SLLineRoute | null;
  selectedRoutes: SLLineRoute[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentAgency: 'SL' | 'WAAB';
  stopPassages: Map<string, { time: string, stopped: boolean, duration?: string }>;
}

const getTransportIcon = (lineTitle: string, agency?: 'SL' | 'WAAB') => {
  if (agency === 'WAAB') return <Ship className="w-5 h-5 text-cyan-500" />;
  
  const lineName = lineTitle.replace('Linje ', '').trim();
  const num = parseInt(lineName);

  // Om det inte är ett nummer (t.ex. ersättningsbussar med bokstäver), anta buss
  if (isNaN(num)) return <Bus className="w-5 h-5 text-red-500" />;

  // Tunnelbana (Blå, Röd, Grön)
  if ([10, 11, 13, 14, 17, 18, 19].includes(num)) {
    return <TrainFront className="w-5 h-5 text-blue-600" />; // Defaulting to generic color, specific styling happens elsewhere or via text-* classes
  }

  // Spårväg / Lokalbanor
  if ([7, 12, 21, 30, 31].includes(num)) {
    return <TramFront className="w-5 h-5 text-orange-600" />;
  }

  // Tåg (Pendeltåg, Roslagsbanan, Saltsjöbanan)
  if ([25, 26, 27, 28, 29, 40, 41, 42, 43, 44, 48].includes(num)) {
    return <Train className="w-5 h-5 text-pink-500" />;
  }

  // Pendelbåtar
  if ([80, 82, 83, 84, 89].includes(num)) {
    return <Ship className="w-5 h-5 text-cyan-600" />;
  }

  // Standard Buss (Röd eller Blå)
  // Blåbussar
  const blueBusLines = [1, 2, 3, 4, 5, 6, 172, 173, 176, 177, 178, 179, 471, 474, 670, 676, 677, 873, 875];
  if (blueBusLines.includes(num)) {
    return <Bus className="w-5 h-5 text-blue-600" />;
  }

  return <Bus className="w-5 h-5 text-red-600" />;
};

const SearchBar: React.FC<SearchBarProps> = ({
  onSelect,
  searchQuery,
  onSearchChange,
  currentAgency,
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        setLoading(true);
        try {
          const res = await slService.search(searchQuery, currentAgency);
          setResults(res);
          setShowResults(true);
        } catch (e) {
          console.error("Search failed", e);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, currentAgency]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (res: SearchResult) => {
    onSelect(res);
    setShowResults(false);
    onSearchChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleResultClick(results[0]);
    }
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <Search className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-10 py-3 border border-white/10 rounded-2xl leading-5 bg-slate-900/95 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 sm:text-sm backdrop-blur-xl shadow-2xl transition-all"
          placeholder={currentAgency === 'WAAB' ? "Sök linje eller brygga..." : "Sök linje eller hållplats..."}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
              if (searchQuery.trim().length > 0) setShowResults(true);
          }}
        />
        {searchQuery && (
          <button
            onClick={() => {
                onSearchChange('');
                setResults([]);
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute mt-2 w-full bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-h-[60vh] overflow-y-auto z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {results.map((res) => (
            <button
              key={`${res.type}-${res.id}`}
              onClick={() => handleResultClick(res)}
              className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors flex items-center gap-3 border-b border-white/5 last:border-0 group"
            >
              <div className="shrink-0">
                {res.type === 'stop' ? (
                  <MapPin className="w-5 h-5 text-emerald-500" />
                ) : (
                  getTransportIcon(res.title, res.agency)
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white group-hover:text-blue-200 transition-colors truncate">
                    {res.title}
                </span>
                {res.subtitle && (
                    <span className="text-xs text-slate-400 truncate">
                        {res.subtitle}
                    </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
