
import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { SLServiceAlert } from '../services/slService';

interface LineAlertsProps {
  alerts: SLServiceAlert[];
}

const LineAlerts: React.FC<LineAlertsProps> = ({ alerts }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (alerts.length === 0) return null;

  return (
    <div className="w-full animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-2 bg-amber-500 rounded-xl shadow-lg shadow-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-slate-900" />
            </div>
            <span className="text-xs font-bold text-amber-500 truncate uppercase tracking-tight">
              {alerts.length === 1 ? 'Störning på linjen' : `${alerts.length} störningar`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest hidden sm:inline">Detaljer</span>
            {isExpanded ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-5 pb-6 space-y-6 border-t border-white/5 bg-black/20">
            <div className="pt-5 space-y-5">
              {alerts.map((alert) => (
                <div key={alert.id} className="space-y-2.5 group">
                  <div className="flex gap-3">
                      <div className="mt-0.5 p-1 bg-amber-500/10 rounded-md">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                      <div className="text-[13px] font-bold text-white leading-snug">
                          {alert.header}
                      </div>
                  </div>
                  {alert.description && (
                    <div className="text-[12px] text-zinc-400 leading-relaxed font-medium pl-8.5 border-l border-white/5 ml-2.5">
                      {alert.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LineAlerts;
