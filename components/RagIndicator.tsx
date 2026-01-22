import React from 'react';

interface RagIndicatorProps {
  logs: any[];
}

export const RagIndicator: React.FC<RagIndicatorProps> = ({ logs }) => {
  // Check if the last log was a RAG event within the last 3 seconds
  const lastLog = logs[logs.length - 1];
  const isSearching = lastLog?.type === 'rag' && Date.now() - lastLog.timestamp < 3000;

  if (!isSearching) return null;

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-down">
      <div className="flex items-center gap-3 px-6 py-2 bg-emerald-900/80 border border-emerald-500/30 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)] text-emerald-100 backdrop-blur-md">
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </div>
        <span className="text-sm font-semibold tracking-wide">RAG ACTIVE: RETRIEVING CONTEXT</span>
      </div>
    </div>
  );
};