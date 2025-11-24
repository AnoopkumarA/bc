
import React, { useEffect, useRef, useState } from 'react';
import { useLiveSession } from '../hooks/useLiveSession';
import { ResumeContext, ConnectionState, AnswerLength } from '../types';
import { ICONS } from '../constants';

interface AssistantOverlayProps {
  context: ResumeContext;
  onBack: () => void;
  onTogglePiP: () => void;
  isPiP: boolean;
  isNative?: boolean;
  isStealthActive?: boolean;
}

const AssistantOverlay: React.FC<AssistantOverlayProps> = ({ 
  context, 
  onBack, 
  onTogglePiP, 
  isPiP,
  isNative = false,
  isStealthActive = false
}) => {
  const {
    connect,
    disconnect,
    connectionState,
    segments,
    answerLength,
    updateLength,
    volumeLevel,
    clearSegments
  } = useLiveSession({ context });

  const [isHidden, setIsHidden] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        if (!isPiP) setIsHidden(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPiP]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [segments, connectionState]);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  const handleClear = () => {
    clearSegments();
  };

  const containerClasses = isPiP
    ? "w-full h-full bg-black flex flex-col overflow-hidden"
    : `fixed bottom-6 right-6 z-50 transition-all duration-300 ease-in-out w-[400px] bg-black/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${isHidden ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'}`;

  // Volume visualization safety
  const safeVolume = (typeof volumeLevel === 'number' && isFinite(volumeLevel)) ? volumeLevel : 0;
  const volumePercent = Math.min(100, Math.max(5, safeVolume * 400));

  // Strict Render Logic with no fall-throughs
  const renderMainContent = () => {
    if (isConnecting) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-yellow-500 gap-3 w-full h-full animate-pulse bg-black/20">
                <span className="w-8 h-8 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></span>
                <span className="text-sm font-medium">Initializing Connection...</span>
            </div>
        );
    }

    if (isConnected) {
        if (segments.length === 0) {
            // Connected but waiting for input
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-300 gap-6 w-full h-full bg-neutral-900/20 rounded-lg border border-white/5 m-2 p-4">
                    <div className="flex items-center gap-3 px-5 py-2.5 bg-neutral-900 rounded-full border border-neutral-800 shadow-lg">
                        <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </span>
                        <span className="text-sm font-semibold tracking-wide text-white">LIVE</span>
                    </div>
                    
                    {/* Volume Visualizer */}
                    <div className="w-48 h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                        <div 
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-75 ease-out"
                            style={{ width: `${volumePercent}%` }}
                        />
                    </div>
                    
                    <div className="text-center space-y-2">
                        <p className="text-sm text-neutral-400 font-medium">Listening to System Audio</p>
                        <p className="text-xs text-neutral-600 font-mono">Waiting for interview questions...</p>
                    </div>
                </div>
            );
        } else {
            // Connected with history
            return (
                <div className="flex flex-col gap-4 pb-2 w-full">
                    {segments.map((segment) => {
                        const isUser = segment.role === 'user';
                        return (
                            <div 
                                key={segment.id} 
                                className={`relative p-4 rounded-xl transition-all duration-300 ${
                                    isUser 
                                    ? 'bg-neutral-800/80 border border-white/5 text-neutral-300 ml-0 mr-8' 
                                    : segment.isComplete 
                                        ? 'bg-neutral-900/80 text-neutral-200 border border-white/5 ml-4' 
                                        : 'bg-blue-900/20 text-white border border-blue-500/20 shadow-lg shadow-blue-900/10 ml-4'
                                }`}
                            >
                                <div className={`absolute -top-2.5 left-4 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${
                                    isUser
                                    ? 'bg-neutral-900 border-neutral-700 text-neutral-500'
                                    : segment.isComplete ? 'bg-black/80 border-white/10 text-neutral-500' : 'bg-blue-950 border-blue-500/30 text-blue-300'
                                }`}>
                                    {isUser ? 'Question' : (segment.isComplete ? 'Answer' : 'Thinking')}
                                </div>
                                
                                <p className="whitespace-pre-wrap leading-relaxed text-sm font-medium">
                                    {segment.text}
                                </p>
                            </div>
                        );
                    })}
                </div>
            );
        }
    }

    // Default: Disconnected / Error / Ready
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-3 py-10 w-full h-full">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <ICONS.Zap />
            </div>
            <p className="text-sm text-center max-w-[200px] text-neutral-400">
                {isNative 
                ? "Native Mode Ready. Audio capture uses system default." 
                : "Connect to start listening"}
            </p>
            {connectionState === ConnectionState.ERROR && (
                <span className="text-xs text-red-400 bg-red-900/10 px-2 py-1 rounded">Connection Error. Check Logs.</span>
            )}
        </div>
    );
  };

  return (
    <div className={containerClasses}>
        
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 bg-neutral-900/50 border-b border-white/10 flex-none z-10 ${(!isPiP && !isNative) ? 'draggable cursor-grab active:cursor-grabbing' : 'app-drag-region'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
              isConnecting ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
            }`} />
            <span className="text-xs font-bold tracking-widest text-neutral-400 uppercase">
              {isConnected ? 'LIVE' : (isConnecting ? 'CONNECTING' : 'READY')}
            </span>
            
            {/* Stealth Indicator */}
            {isStealthActive && (
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border shadow-sm select-none ml-2 ${
                    isNative 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-900/20' 
                        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 shadow-indigo-900/20'
                }`}>
                    {isNative ? (
                        <>
                            <div className="scale-75"><ICONS.EyeOff /></div>
                            <span>INVISIBLE</span>
                        </>
                    ) : (
                        <>
                             <div className="scale-75"><ICONS.Ghost /></div>
                             <span>GHOST</span>
                        </>
                    )}
                </div>
            )}
          </div>
          <div className="flex items-center gap-2">
             {/* Toggle Mode Button */}
             <button 
                onClick={onTogglePiP} 
                className={`p-1.5 rounded-md transition-all duration-200 ${
                    isStealthActive 
                        ? (isNative ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20') 
                        : 'hover:bg-white/10 text-neutral-400 hover:text-white'
                }`}
                title={isNative ? "Toggle Capture Protection" : "Pop out Overlay"}
             >
              {isNative ? <ICONS.EyeOff /> : (isPiP ? <ICONS.ExternalLink /> : <ICONS.Ghost />)}
            </button>

            {(!isPiP || isNative) && (
                <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-md text-neutral-400 hover:text-white transition-colors" title="Settings">
                    <ICONS.Settings />
                </button>
            )}
          </div>
        </div>

        {/* Main Content Area - Explicit Rendering Logic */}
        <div className="flex-1 p-4 overflow-y-auto min-h-0 flex flex-col relative scroll-smooth w-full z-0" ref={contentRef}>
            {renderMainContent()}
        </div>

        {/* Footer Controls */}
        <div className="p-3 bg-neutral-900/80 border-t border-white/10 flex flex-col gap-2 flex-none z-10">
          {!isConnected ? (
             <button 
                onClick={connect}
                disabled={isConnecting}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold tracking-wide transition-all text-sm ${
                    isConnecting 
                    ? 'bg-yellow-600/20 border border-yellow-600/50 text-yellow-500 cursor-wait' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 hover:scale-[1.02] active:scale-[0.98]'
                }`}
             >
                {isConnecting ? 'CONNECTING...' : (
                    <>
                        <ICONS.Play />
                        START SESSION
                    </>
                )}
             </button>
          ) : (
              <div className="flex flex-col gap-2 w-full">
                <div className="flex w-full gap-2 mt-1">
                    <div className="flex-1 flex bg-black/40 rounded-lg p-1 border border-white/5">
                        {Object.values(AnswerLength).map((len) => (
                            <button 
                                key={len}
                                onClick={() => updateLength(len)}
                                className={`flex-1 text-[10px] uppercase font-bold py-1.5 rounded transition-all ${answerLength === len ? 'bg-neutral-700 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                {len}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={handleClear} className="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-neutral-400 hover:text-white rounded-lg text-xs font-semibold transition-colors">CLEAR</button>
                    <button onClick={disconnect} className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-lg flex items-center justify-center transition-colors shadow-red-900/10"><ICONS.Square /></button>
                </div>
              </div>
          )}
        </div>
    </div>
  );
};

export default AssistantOverlay;
