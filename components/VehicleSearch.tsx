import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Loader2, Bus, Ship, Hash } from 'lucide-react';
import { slService } from '../services/slService';
import { SLVehicle } from '../types';
import { SHIP_NAMES } from '../constants';

interface VehicleSearchProps {
  onVehicleFound: (vehicle: SLVehicle, routeId: string) => void;
  currentAgency: 'SL' | 'WAAB';
}

const VehicleSearch: React.FC<VehicleSearchProps> = ({ onVehicleFound, currentAgency }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isWAAB = currentAgency === 'WAAB';

  const suggestions = useMemo(() => {
    if (!isWAAB || query.length < 1) return [];
    const q = query.toLowerCase();
    return Object.entries(SHIP_NAMES)
      .filter(([code, name]) => 
        name.toLowerCase().includes(q) || code.includes(q)
      )
      .slice(0, 5);
  }, [query, isWAAB]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (searchVal: string) => {
    setLoading(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const result = await slService.findVehicle(searchVal);
      if (result) {
        onVehicleFound(result.vehicle, result.routeId);
        setQuery('');
      } else {
        setError(isWAAB ? 'Fartyget ej i trafik' : 'Vagn ej i trafik');
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      setError('Kunde inte söka');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    performSearch(query.trim());
  };

  return (
    <div ref={containerRef} className="relative bg-slate-900/90 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl flex flex-col gap-2 w-full md:w-auto md:min-w-[240px]">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder={isWAAB ? "Sök fartyg..." : "Vagnsnr..."}
              className="w-full bg-slate-800/50 text-white placeholder-slate-500 text-sm rounded-xl px-3 py-2 pr-8 outline-none focus:bg-slate-800 transition-colors border border-transparent focus:border-blue-500/30"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              {isWAAB ? (
                <Ship className="w-3.5 h-3.5 text-cyan-500" />
              ) : (
                <Hash className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
        </div>
        <button 
            type="submit"
            disabled={loading || !query.trim()}
            className={`p-2 rounded-xl transition-colors shadow-lg ${
              isWAAB ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-blue-600 hover:bg-blue-500'
            } disabled:bg-slate-700 disabled:cursor-not-allowed text-white`}
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          {suggestions.map(([code, name]) => (
            <button
              key={code}
              onClick={() => {
                setQuery(name);
                performSearch(code);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2">
                <Ship className="w-3.5 h-3.5 text-cyan-500 opacity-60 group-hover:opacity-100" />
                <span className="font-bold">{name}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{code}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
          <div className="text-[11px] font-bold text-red-400 text-center pb-1 animate-in fade-in slide-in-from-top-1">
              {error}
          </div>
      )}
    </div>
  );
};

export default VehicleSearch;