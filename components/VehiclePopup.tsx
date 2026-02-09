
import React from 'react';
import { SLVehicle } from '../types';
import { Building2, Hash, Gauge, Activity } from 'lucide-react';

interface VehiclePopupProps {
  vehicle: SLVehicle;
  lineShortName: string;
}

const VehiclePopup: React.FC<VehiclePopupProps> = ({ vehicle, lineShortName }) => {
  const match = /([0-9]{3})([0-9]{4})$/.exec(vehicle.id);
  const companyCode = match ? match[1] : null;
  
  let company = "Okänd";
  switch (companyCode) {
    case "050": company = "Blidösundsbolaget"; break;
    case "070": case "705": case "706": case "707": case "709": company = "AB Stockholms Spårvägar"; break;
    case "100": company = "Keolis"; break;
    case "150": company = "VR Sverige"; break;
    case "251": company = "Connecting Stockholm"; break;
    case "300": company = "Nobina"; break;
    case "450": case "456": case "459": company = "Transdev"; break;
    case "650": company = "SJ Stockholmståg"; break;
    case "750": company = "Djurgårdens färjetrafik"; break;
    case "800": company = "Ballerina"; break;
    default: company = companyCode ? `Entreprenör ${companyCode}` : "Okänd";
  }

  const vehicleNumber = vehicle.vehicleNumber || vehicle.id.slice(-4);
  const roundedSpeed = Math.round(vehicle.speed);
  const hasDestination = vehicle.destination && vehicle.destination !== "Okänd";

  const getDelayInfo = () => {
    if (vehicle.delay === undefined) return { text: "Realtid", color: "text-slate-500" };
    const delayMin = Math.round(vehicle.delay / 60);
    if (Math.abs(vehicle.delay) < 45) return { text: "I tid", color: "text-emerald-600" };
    if (vehicle.delay > 0) return { text: `${delayMin} min sen`, color: "text-rose-600" };
    return { text: `${Math.abs(delayMin)} min tidig`, color: "text-sky-600" };
  };

  const delayStatus = getDelayInfo();

  return (
    <div className="bg-white min-w-[280px] font-sans overflow-hidden">
      <div className="bg-slate-900 p-4 text-white">
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${vehicle.agency === 'WAAB' ? 'bg-cyan-600' : 'bg-blue-600 shadow-lg shadow-blue-500/20'}`}>
                {lineShortName}
            </div>
            <div className="flex flex-col min-w-0">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">
                    {vehicle.type === 'Färja' ? 'Fartyg' : 'Buss'}
                </div>
                <div className="text-sm font-bold text-white truncate leading-tight">
                    {hasDestination ? `mot ${vehicle.destination}` : `Linje ${lineShortName}`}
                </div>
            </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Entreprenör
                </div>
                <div className="text-xs font-bold text-slate-700 truncate" title={company}>{company}</div>
            </div>
            <div className="space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Vagnsnr
                </div>
                <div className="text-xs font-bold text-slate-700">{vehicleNumber}</div>
            </div>
            <div className="space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Gauge className="w-3 h-3" /> Hastighet
                </div>
                <div className="text-xs font-bold text-slate-700">{roundedSpeed} km/h</div>
            </div>
            <div className="space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Punktlighet
                </div>
                <div className={`text-xs font-bold flex items-center gap-1 ${delayStatus.color}`}>
                    {delayStatus.text}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default VehiclePopup;
