import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import { processTextQuery } from './services/textAgentService';
import { ConnectionState, LogEntry } from './types';
import AudioVisualizer from './components/AudioVisualizer';
import { RagIndicator } from './components/RagIndicator';
import { AdminPanel } from './components/AdminPanel';
import { decode, decodeAudioData, AUDIO_SAMPLE_RATE } from './utils/audioUtils';

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<'agent' | 'admin'>('agent');

  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [transcripts, setTranscripts] = useState<{sender: 'user' | 'agent', text: string}[]>([]);
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(128));
  
  // Call Timer State
  const [callDuration, setCallDuration] = useState(0);
  
  // Text Input State
  const [textInput, setTextInput] = useState("");
  const [isProcessingText, setIsProcessingText] = useState(false);
  
  // Dictation State
  const [isDictating, setIsDictating] = useState(false);
  
  // Refs
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const textBeforeDictation = useRef("");
  const connectionStateRef = useRef(connectionState);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync ref with state for async access
  useEffect(() => {
    connectionStateRef.current = connectionState;
    
    // Manage Call Timer
    if (connectionState === ConnectionState.CONNECTED) {
        if (!timerRef.current) {
            setCallDuration(0);
            timerRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
    } else {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }
  }, [connectionState]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const addLog = (type: 'user' | 'agent' | 'system' | 'rag', content: string) => {
    setLogs(prev => [...prev, {
        id: Math.random().toString(36),
        timestamp: Date.now(),
        type,
        content
    }]);
  };

  const handleStart = async () => {
    if (ttsSourceRef.current) {
        ttsSourceRef.current.stop();
        ttsSourceRef.current = null;
    }
    
    if (isDictating && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsDictating(false);
    }

    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }

    serviceRef.current = new GeminiLiveService({
      onStateChange: (state) => setConnectionState(state),
      onAudioData: (data) => setAudioData(data),
      onLog: addLog,
      onTranscript: (text, isFinal, sender) => {
        setTranscripts(prev => {
           const last = prev[prev.length - 1];
           if (last && last.sender === sender) {
             const newArr = [...prev];
             newArr[newArr.length - 1] = {
                 ...last,
                 text: last.text + text
             };
             return newArr; 
           }
           return [...prev, { sender, text }];
        });
      }
    });

    await serviceRef.current.connect();
  };

  const handleStop = () => {
    serviceRef.current?.disconnect();
    setConnectionState(ConnectionState.DISCONNECTED);
    
    if (ttsSourceRef.current) {
        try {
            ttsSourceRef.current.stop();
        } catch (e) { /* ignore */ }
        ttsSourceRef.current = null;
    }
  };

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    if (connectionState === ConnectionState.CONNECTED) {
        handleStop();
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addLog('system', "Browser does not support Speech Recognition.");
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsDictating(true);
      textBeforeDictation.current = textInput;
      addLog('system', "Agent Voice Dictation Active...");
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      const newText = (textBeforeDictation.current + (textBeforeDictation.current ? ' ' : '') + finalTranscript + interimTranscript);
      setTextInput(newText);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsDictating(false);
      addLog('system', `Dictation Error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsDictating(false);
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    const userQuery = textInput;
    setTextInput(""); 

    if (isDictating && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsDictating(false);
    }

    if (connectionState === ConnectionState.CONNECTED) {
        handleStop();
    }
    
    if (ttsSourceRef.current) {
        try { ttsSourceRef.current.stop(); } catch(e) {}
        ttsSourceRef.current = null;
    }

    setIsProcessingText(true);
    setTranscripts(prev => [...prev, { sender: 'user', text: userQuery }]);
    
    setTimeout(() => {
        setTranscripts(prev => [...prev, { sender: 'agent', text: '' }]);
    }, 10);
    
    try {
        const { text, audioBase64 } = await processTextQuery(
            userQuery, 
            addLog,
            (token) => {
                setTranscripts(prev => {
                    const newArr = [...prev];
                    const lastIdx = newArr.length - 1;
                    if (lastIdx >= 0 && newArr[lastIdx].sender === 'agent') {
                        newArr[lastIdx] = { 
                            ...newArr[lastIdx], 
                            text: newArr[lastIdx].text + token 
                        };
                    }
                    return newArr;
                });
            }
        );
        
        if (connectionStateRef.current !== ConnectionState.DISCONNECTED) {
            return; 
        }

        if (!ttsAudioContextRef.current) {
            ttsAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: AUDIO_SAMPLE_RATE,
            });
        }
        const ctx = ttsAudioContextRef.current;

        const audioBuffer = await decodeAudioData(
            decode(audioBase64),
            ctx,
            AUDIO_SAMPLE_RATE,
            1
        );

        if (ttsSourceRef.current) {
            try { ttsSourceRef.current.stop(); } catch(e) {}
        }
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        ttsSourceRef.current = source;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVisualizer = () => {
            if (!ttsSourceRef.current || ttsSourceRef.current !== source) return;
            analyser.getByteFrequencyData(dataArray);
            setAudioData(new Uint8Array(dataArray)); 
            requestAnimationFrame(updateVisualizer);
        };
        updateVisualizer();

        source.onended = () => {
            if (ttsSourceRef.current === source) {
                setIsProcessingText(false);
                setAudioData(new Uint8Array(128)); 
            }
        };

        source.start();
        
        setTranscripts(prev => {
             const newArr = [...prev];
             const lastIdx = newArr.length - 1;
             if (lastIdx >= 0 && newArr[lastIdx].sender === 'agent') {
                 newArr[lastIdx].text = text;
             }
             return newArr;
        });

    } catch (error: any) {
        console.error(error);
        addLog('system', `Error: ${error.message}`);
        setIsProcessingText(false);
    }
  };

  return (
    <div className={`h-screen w-full text-white flex flex-col relative overflow-hidden font-sans selection:bg-indigo-500/30 ${currentView === 'admin' ? 'bg-[#0a0a00]' : 'bg-[#09090b]'}`}>
      {/* Background Decor */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      
      {currentView === 'agent' && <RagIndicator logs={logs} />}

      {/* Enterprise Header */}
      <header className="flex-none px-6 py-4 border-b border-white/10 flex justify-between items-center bg-black/60 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
            <div className="flex flex-col">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  NEXUS ENTERPRISE
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono border tracking-wider ${
                      currentView === 'admin' 
                      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' 
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  }`}>
                      {currentView === 'admin' ? 'ADMIN_CONSOLE_ROOT' : 'SUPPORT_DESK_V4'}
                  </span>
                </h1>
                <p className="text-xs text-zinc-500 font-medium">Global Contact Center • Agent ID: 4402</p>
            </div>
        </div>
        
        <div className="flex items-center gap-6">
           {connectionState === ConnectionState.CONNECTED && currentView === 'agent' && (
             <div className="flex flex-col items-end">
                 <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/40 px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                   <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                   VOICE GATEWAY ACTIVE
                 </div>
                 <span className="text-xs font-mono text-zinc-400 mt-1">DURATION: {formatTime(callDuration)}</span>
             </div>
           )}

           {/* View Switcher */}
           <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-white/10">
                <button 
                    onClick={() => setCurrentView('agent')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        currentView === 'agent' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-white'
                    }`}
                >
                    Agent View
                </button>
                <button 
                    onClick={() => setCurrentView('admin')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        currentView === 'admin' ? 'bg-amber-600 text-black font-bold' : 'text-zinc-500 hover:text-white'
                    }`}
                >
                    Admin
                </button>
           </div>

           {currentView === 'agent' && (
               <button
                 onClick={connectionState === ConnectionState.CONNECTED ? handleStop : handleStart}
                 className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg border ${
                    connectionState === ConnectionState.CONNECTED 
                    ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50' 
                    : 'bg-emerald-600 text-white border-transparent hover:bg-emerald-500 hover:scale-105 shadow-emerald-500/20'
                 }`}
               >
                 {connectionState === ConnectionState.CONNECTING ? 'Connecting Gateway...' : 
                  connectionState === ConnectionState.CONNECTED ? 'End Call' : 'Accept Incoming Call'}
               </button>
           )}
        </div>
      </header>

      {/* Main Layout Swapping */}
      {currentView === 'admin' ? (
          <AdminPanel />
      ) : (
          <main className="flex-1 flex gap-4 p-4 overflow-hidden relative z-10">
            {/* ... Existing Agent Layout ... */}
            
            {/* Left Column: Customer Context & Tools */}
            <div className="w-80 flex flex-col gap-4">
                {/* Customer CRM Card */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                            <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white">Incoming Caller</div>
                            <div className="text-xs text-zinc-400">+1 (555) 012-3456</div>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Customer Tier</span>
                            <span className="text-indigo-400 font-medium">Enterprise Platinum</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Last Interaction</span>
                            <span className="text-zinc-300">2 hours ago</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Sentiment</span>
                            <span className="text-emerald-400">Neutral</span>
                        </div>
                    </div>
                </div>

                {/* Visualizer / Call Quality */}
                <div className="flex-1 rounded-xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm flex flex-col p-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-indigo-500 opacity-50"></div>
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Voice Signal Analysis</h3>
                    
                    <div className="flex-1 flex items-center justify-center relative">
                         {/* Ambient Glow */}
                        <div className={`absolute w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px] transition-opacity duration-700 ${
                        connectionState === ConnectionState.CONNECTED ? 'opacity-100' : 'opacity-0'
                        }`}></div>
                        
                        <AudioVisualizer 
                            data={audioData} 
                            isActive={connectionState === ConnectionState.CONNECTED || isProcessingText}
                            color={isProcessingText ? '#a78bfa' : '#34d399'} // Emerald for Call Center
                        />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] font-mono text-zinc-600">
                        <span>MIC: {connectionState === ConnectionState.CONNECTED ? 'ON' : 'OFF'}</span>
                        <span>OUT: STEREO 24kHz</span>
                    </div>
                </div>
            </div>

            {/* Center: Transcription / Script */}
            <div className="flex-1 flex flex-col rounded-xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm relative overflow-hidden shadow-xl">
                {/* Chat Header */}
                <div className="px-6 py-3 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <span className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">Live Transcription Stream</span>
                    <span className="text-[10px] font-mono text-zinc-600 bg-black/20 px-2 py-1 rounded">EN-US | SECURE</span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-black/20">
                    {transcripts.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4 opacity-50">
                            <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center border border-white/5">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            </div>
                            <p className="text-sm font-medium">Waiting for call connection...</p>
                        </div>
                    )}
                    {transcripts.map((t, i) => (
                        <div key={i} className={`flex ${t.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                            <div className={`flex flex-col max-w-[85%] ${t.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                <span className="text-[10px] text-zinc-500 mb-1 px-1">
                                    {t.sender === 'user' ? 'CUSTOMER' : 'NEXUS AGENT'}
                                </span>
                                <div className={`rounded-xl px-5 py-3 text-sm leading-relaxed shadow-sm backdrop-blur-sm ${
                                    t.sender === 'user' 
                                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700' 
                                    : 'bg-indigo-900/40 text-indigo-100 border border-indigo-500/20'
                                }`}>
                                    {t.text}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={transcriptEndRef} />
                </div>
                
                {/* Input Area */}
                <div className="p-4 bg-zinc-900/80 border-t border-white/5 backdrop-blur-md">
                    <form onSubmit={handleTextSubmit} className="relative group">
                        <div className="relative flex items-center bg-black/50 rounded-lg border border-white/10 overflow-hidden shadow-inner focus-within:border-indigo-500/50 transition-colors">
                            <input 
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder="Type response manual override..."
                                className="flex-1 bg-transparent border-none px-4 py-3 text-sm text-gray-200 placeholder-zinc-600 focus:ring-0 focus:outline-none font-mono"
                                disabled={isProcessingText}
                            />
                            
                            <div className="flex items-center gap-1 pr-2">
                                <button
                                    type="button"
                                    onClick={toggleDictation}
                                    disabled={isProcessingText}
                                    className={`p-2 rounded transition-all duration-200 ${
                                        isDictating 
                                        ? 'text-red-400 bg-red-900/20 animate-pulse' 
                                        : 'text-zinc-500 hover:text-white'
                                    }`}
                                    title="Agent Dictation"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                                </button>
                                
                                <button 
                                    type="submit" 
                                    disabled={!textInput.trim() || isProcessingText}
                                    className="p-2 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* Right Column: Knowledge Base / System Logs */}
            <div className="w-80 flex flex-col rounded-xl bg-black/40 border border-white/10 overflow-hidden shadow-xl backdrop-blur-xl">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/10 bg-zinc-900/80 flex justify-between items-center">
                    <h3 className="text-[10px] font-semibold text-zinc-500 font-mono tracking-widest uppercase">Agent_Assist_Log</h3>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
                
                {/* Log Content */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-3 bg-black/20">
                    {logs.length === 0 && (
                        <div className="text-zinc-600 italic p-2 border border-dashed border-zinc-800 rounded">
                            &gt; Knowledge Base Linked<br/>
                            &gt; Waiting for queries...
                        </div>
                    )}
                    {logs.map((log) => {
                        const date = new Date(log.timestamp);
                        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                        return (
                            <div key={log.id} className="flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0">
                                <span className="text-zinc-600 select-none flex justify-between">
                                    <span>{time}</span>
                                    <span className={`uppercase font-bold ${
                                        log.type === 'rag' ? 'text-emerald-500' :
                                        log.type === 'system' ? 'text-blue-500' :
                                        log.type === 'user' ? 'text-indigo-500' : 'text-zinc-500'
                                    }`}>{log.type}</span>
                                </span>
                                <span className="text-zinc-300 break-words leading-tight">
                                    {log.type === 'rag' && "🔍 "}{log.content}
                                </span>
                            </div>
                        );
                    })}
                    <div ref={logsEndRef} />
                </div>
            </div>
          </main>
      )}
    </div>
  );
};

export default App;