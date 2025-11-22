import React from 'react';
import { AnalysisResult } from '../types';
import { FaRobot, FaTimes } from 'react-icons/fa';

interface AnalysisPanelProps {
  result: AnalysisResult;
  onClose: () => void;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result, onClose }) => {
  if (!result.text && !result.error) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:right-[26rem] pointer-events-none flex flex-col justify-end z-20">
      <div className="bg-black/80 backdrop-blur-md border border-cyan-500/30 p-6 rounded-xl pointer-events-auto shadow-2xl animate-slide-up relative overflow-hidden group">
        
        {/* Decorative scanning line */}
        {result.loading && (
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan"></div>
        )}

        <div className="flex justify-between items-start mb-3">
          <h3 className="text-cyan-400 font-bold text-lg flex items-center gap-2">
            <FaRobot />
            GEMINI ANALYSIS
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FaTimes />
          </button>
        </div>

        <div className="text-gray-200 text-sm md:text-base leading-relaxed font-light font-sans">
          {result.loading ? (
            <div className="flex items-center gap-2 text-cyan-200 animate-pulse">
              <span>Đang xử lý dữ liệu lượng tử...</span>
            </div>
          ) : result.error ? (
            <div className="text-red-400 bg-red-900/20 p-3 rounded border border-red-500/30">
              {result.error}
            </div>
          ) : (
            <div className="prose prose-invert max-w-none">
                {/* Simple formatting for line breaks */}
                {result.text.split('\n').map((line, i) => (
                    <p key={i} className="mb-2">{line}</p>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;
