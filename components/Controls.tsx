
import React from 'react';
import { BlackHoleParams } from '../types';
import { PLANETS, GALAXIES, NEBULAE, EXOPLANETS } from '../constants';
import { 
  FaWeightHanging, 
  FaSyncAlt, 
  FaThermometerHalf, 
  FaCloudMeatball,
  FaAtom,
  FaRocket,
  FaGlobeAmericas,
  FaStar,
  FaCloud,
  FaGlobe,
  FaGamepad
} from 'react-icons/fa';

interface ControlsProps {
  params: BlackHoleParams;
  setParams: React.Dispatch<React.SetStateAction<BlackHoleParams>>;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  destination: string | null;
  setDestination: (dest: string) => void;
  pilotMode: boolean;
  setPilotMode: (mode: boolean) => void;
}

const Controls: React.FC<ControlsProps> = ({ 
  params, setParams, onAnalyze, isAnalyzing, destination, setDestination, pilotMode, setPilotMode
}) => {
  
  const handleChange = (key: keyof BlackHoleParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const togglePilotMode = async () => {
    if (!pilotMode) {
      const canvas = document.querySelector('canvas');
      if (canvas) {
          try {
            // Use a small timeout to ensure no conflicting lock requests
            await new Promise(resolve => setTimeout(resolve, 100));
            await canvas.requestPointerLock();
            setPilotMode(true);
          } catch (e) {
              console.warn("Pointer lock failed or cancelled:", e);
              // Don't enable pilot mode if lock fails
          }
      }
    } else {
      if (document.pointerLockElement) {
          document.exitPointerLock();
      }
      setPilotMode(false);
    }
  };

  const renderNavButton = (name: string, isActive: boolean, onClick: () => void, colorClass: string, glowClass: string) => (
      <button
          key={name}
          onClick={onClick}
          disabled={pilotMode}
          className={`px-1 py-2 text-[10px] md:text-xs font-bold rounded border transition-all truncate ${
              isActive 
              ? `bg-opacity-30 border-opacity-100 text-white ${colorClass} ${glowClass}`
              : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/30'
          } ${pilotMode ? 'opacity-30 cursor-not-allowed' : ''}`}
      >
          {name}
      </button>
  );

  return (
    <div className={`fixed top-0 right-0 h-full w-full md:w-96 p-6 pointer-events-none flex flex-col justify-center z-10 overflow-y-auto transition-transform duration-500 ${pilotMode ? 'translate-x-full' : 'translate-x-0'}`}>
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl pointer-events-auto shadow-2xl shadow-cyan-900/20 max-h-full overflow-y-auto scrollbar-hide">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-4">
          <FaAtom className="text-cyan-400" />
          HỆ THỐNG ĐIỀU KHIỂN
        </h2>

        <div className="space-y-6">
          
          {/* Mass Control */}
          <div className="space-y-2">
            <div className="flex justify-between text-cyan-300 text-sm font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-2"><FaWeightHanging /> Khối Lượng (M☉)</span>
              <span>{params.mass.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="0.1"
              value={params.mass}
              onChange={(e) => handleChange('mass', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"
            />
          </div>

          {/* Spin Control */}
          <div className="space-y-2">
            <div className="flex justify-between text-purple-300 text-sm font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-2"><FaSyncAlt /> Độ Xoáy (Spin)</span>
              <span>{Math.round(params.spin * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={params.spin}
              onChange={(e) => handleChange('spin', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
            />
          </div>

          {/* Temperature Control */}
          <div className="space-y-2">
            <div className="flex justify-between text-orange-300 text-sm font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-2"><FaThermometerHalf /> Nhiệt Độ (K)</span>
              <span>{params.temperature.toLocaleString()} K</span>
            </div>
            <input
              type="range"
              min="1000"
              max="50000"
              step="1000"
              value={params.temperature}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
            />
          </div>

          {/* Density Control */}
          <div className="space-y-2">
            <div className="flex justify-between text-emerald-300 text-sm font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-2"><FaCloudMeatball /> Mật Độ Đĩa</span>
              <span>{Math.round(params.accretionDensity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={params.accretionDensity}
              onChange={(e) => handleChange('accretionDensity', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
            />
          </div>

          {/* Navigation System */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h3 className="text-white text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-3">
               <FaRocket className="text-yellow-400"/> BẢN ĐỒ VŨ TRỤ
            </h3>

            {/* Manual Pilot Toggle */}
            <button
               onClick={togglePilotMode}
               className="w-full py-3 mb-4 bg-gradient-to-r from-yellow-600 to-red-600 text-white font-bold rounded border border-white/20 hover:from-yellow-500 hover:to-red-500 transition-all flex items-center justify-center gap-2"
            >
               <FaGamepad size={20} />
               CHẾ ĐỘ LÁI (PILOT MODE)
            </button>
            
            {/* Planetary Travel */}
            <div className="mb-3">
              <h4 className="text-[10px] text-cyan-400/80 font-bold mb-2 flex items-center gap-1 uppercase"><FaGlobeAmericas /> Hệ Mặt Trời</h4>
              <div className="grid grid-cols-4 gap-2">
                  {PLANETS.map((p) => renderNavButton(
                      p.name, 
                      destination === p.name, 
                      () => setDestination(p.name),
                      'bg-cyan-500 border-cyan-400',
                      'shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                  ))}
              </div>
            </div>

            {/* Exoplanets */}
             <div className="mb-3">
              <h4 className="text-[10px] text-green-400/80 font-bold mb-2 flex items-center gap-1 uppercase"><FaGlobe /> Ngoại Hành Tinh</h4>
              <div className="grid grid-cols-3 gap-2">
                  {EXOPLANETS.map((e) => renderNavButton(
                      e.name, 
                      destination === e.name, 
                      () => setDestination(e.name),
                      'bg-green-600 border-green-500',
                      'shadow-[0_0_10px_rgba(74,222,128,0.3)]'
                  ))}
              </div>
            </div>

            {/* Nebulae */}
            <div className="mb-3">
              <h4 className="text-[10px] text-pink-400/80 font-bold mb-2 flex items-center gap-1 uppercase"><FaCloud /> Tinh Vân</h4>
              <div className="grid grid-cols-2 gap-2">
                  {NEBULAE.map((n) => renderNavButton(
                      n.name, 
                      destination === n.name, 
                      () => setDestination(n.name),
                      'bg-pink-600 border-pink-500',
                      'shadow-[0_0_10px_rgba(236,72,153,0.3)]'
                  ))}
              </div>
            </div>

            {/* Intergalactic Travel */}
            <div>
              <h4 className="text-[10px] text-purple-400/80 font-bold mb-2 flex items-center gap-1 uppercase"><FaStar /> Thiên Hà</h4>
              <div className="grid grid-cols-2 gap-2">
                  {GALAXIES.map((g) => renderNavButton(
                      g.name, 
                      destination === g.name, 
                      () => setDestination(g.name),
                      'bg-purple-600 border-purple-500',
                      'shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  ))}
              </div>
            </div>

          </div>

          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`w-full py-4 mt-4 rounded-lg font-bold text-lg tracking-widest uppercase transition-all transform duration-200 
              ${isAnalyzing 
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white hover:from-cyan-500 hover:to-blue-600 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-95'
              }`}
          >
            {isAnalyzing ? 'Đang phân tích...' : 'Phân tích AI'}
          </button>

        </div>
      </div>
    </div>
  );
};

export default Controls;
