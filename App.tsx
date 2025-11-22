

import React, { useState, useEffect } from 'react';
import Scene from './components/Scene';
import Controls from './components/Controls';
import AnalysisPanel from './components/AnalysisPanel';
import { BlackHoleParams, AnalysisResult } from './types';
import { analyzeBlackHole } from './services/geminiService';

const App: React.FC = () => {
  // Initial state for the black hole
  const [params, setParams] = useState<BlackHoleParams>({
    mass: 5.0,
    spin: 0.5,
    temperature: 8000,
    accretionDensity: 0.8,
  });

  // State for AI Analysis
  const [analysis, setAnalysis] = useState<AnalysisResult>({
    text: "",
    loading: false,
    error: null,
  });

  // State for Spaceship Navigation
  const [destination, setDestination] = useState<string | null>(null);
  
  // State for Manual Pilot Mode
  const [pilotMode, setPilotMode] = useState<boolean>(false);
  
  // State for Destroyed Planets
  const [destroyedPlanets, setDestroyedPlanets] = useState<string[]>([]);

  const handleDestroyPlanet = (name: string) => {
      if (!destroyedPlanets.includes(name)) {
          setDestroyedPlanets(prev => [...prev, name]);
          // Optional: Add sound effect logic here
      }
  };

  // Handle ESC key to exit pilot mode
  useEffect(() => {
    const handleLockChange = () => {
      if (document.pointerLockElement === null) {
        setPilotMode(false);
      }
    };
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => document.removeEventListener('pointerlockchange', handleLockChange);
  }, []);

  const handleAnalyze = async () => {
    setAnalysis({ text: "", loading: true, error: null });
    try {
      const text = await analyzeBlackHole(params);
      setAnalysis({ text, loading: false, error: null });
    } catch (err: any) {
      setAnalysis({ 
        text: "", 
        loading: false, 
        error: err.message || "Có lỗi xảy ra khi gọi Gemini API." 
      });
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Layer */}
      <div className="absolute inset-0 z-0">
        <Scene 
          params={params} 
          destination={destination} 
          pilotMode={pilotMode} 
          destroyedPlanets={destroyedPlanets}
          onDestroyPlanet={handleDestroyPlanet}
        />
      </div>

      {/* UI Layer */}
      <div className="relative z-10 h-full pointer-events-none">
        {/* Header */}
        <div className={`absolute top-6 left-6 pointer-events-auto transition-opacity duration-500 ${pilotMode ? 'opacity-0' : 'opacity-100'}`}>
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-blue-500 drop-shadow-[0_0_15px_rgba(0,255,255,0.5)]">
            HỐ ĐEN 3D
          </h1>
          <p className="text-blue-300/80 mt-2 text-sm tracking-widest font-mono">
            INTERACTIVE SINGULARITY SIMULATION
          </p>
        </div>

        {/* Control Panel */}
        <Controls 
          params={params} 
          setParams={setParams} 
          onAnalyze={handleAnalyze}
          isAnalyzing={analysis.loading}
          destination={destination}
          setDestination={setDestination}
          pilotMode={pilotMode}
          setPilotMode={setPilotMode}
        />

        {/* AI Output */}
        <AnalysisPanel 
          result={analysis} 
          onClose={() => setAnalysis(prev => ({ ...prev, text: "", error: null }))}
        />
        
        {/* Pilot Mode HUD */}
        {pilotMode && (
           <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-center pointer-events-none">
              <div className="text-cyan-400 font-orbitron text-2xl font-bold mb-2">PILOT MODE ACTIVE</div>
              <div className="text-white/70 font-mono text-sm bg-black/50 p-4 rounded border border-white/10 flex gap-4 items-center">
                 <div className="flex flex-col"><span className="text-yellow-400 font-bold text-lg">W/S</span><span className="text-xs">THROTTLE</span></div>
                 <div className="flex flex-col"><span className="text-yellow-400 font-bold text-lg">MOUSE</span><span className="text-xs">STEER</span></div>
                 <div className="flex flex-col"><span className="text-yellow-400 font-bold text-lg">A/D</span><span className="text-xs">ROLL</span></div>
                 <div className="bg-white/20 w-px h-8"></div>
                 <div className="flex flex-col"><span className="text-purple-400 font-bold text-lg">E</span><span className="text-xs">LASER</span></div>
                 <div className="flex flex-col"><span className="text-orange-500 font-bold text-lg">R</span><span className="text-xs">MISSILE</span></div>
                 <div className="flex flex-col"><span className="text-green-400 font-bold text-lg">L</span><span className="text-xs">LAND/OFF</span></div>
                 <div className="bg-white/20 w-px h-8"></div>
                 <div className="flex flex-col"><span className="text-red-400 font-bold text-lg">ESC</span><span className="text-xs">EXIT</span></div>
              </div>
           </div>
        )}
      </div>
      
      <style>{`
        @keyframes scan {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out forwards;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default App;