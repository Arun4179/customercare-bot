import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, SYSTEM_INSTRUCTION } from '../types';
import { decode, decodeAudioData, float32ToPCM16Blob, INPUT_SAMPLE_RATE, AUDIO_SAMPLE_RATE } from '../utils/audioUtils';
import { searchKnowledgeBase, searchToolDeclaration } from './mockRagService';

interface ServiceCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onAudioData: (visualizerData: Uint8Array) => void; // For frequency visualizer
  onLog: (type: 'user' | 'agent' | 'system' | 'rag', message: string) => void;
  onTranscript: (text: string, isFinal: boolean, sender: 'user' | 'agent') => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  
  // Need to store session resolver to allow sending input
  private sessionResolver: ((value: any) => void) | null = null;

  constructor(private callbacks: ServiceCallbacks) {
    // API Key is injected by the environment
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async connect() {
    try {
      this.callbacks.onStateChange(ConnectionState.CONNECTING);
      this.callbacks.onLog('system', 'Initializing Audio Contexts...');

      // 1. Setup Audio Input (Mic)
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 2. Setup Audio Output (Speaker)
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: AUDIO_SAMPLE_RATE,
      });
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      this.callbacks.onLog('system', 'Connecting to Gemini Live API...');

      // 3. Establish Live Session
      // We wrap the connect call to capture the session object for sending input
      let sessionResolve: (val: any) => void;
      this.sessionPromise = new Promise((resolve) => {
        sessionResolve = resolve;
      });
      this.sessionResolver = sessionResolve!;

      const liveSession = await this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [searchToolDeclaration] }],
          inputAudioTranscription: {}, // Enable user transcription
          outputAudioTranscription: {} // Enable model transcription
        },
        callbacks: {
          onopen: () => {
            this.callbacks.onStateChange(ConnectionState.CONNECTED);
            this.callbacks.onLog('system', 'Session Connected. Ready.');
            this.startAudioInput();
          },
          onmessage: this.handleMessage.bind(this),
          onclose: (e) => {
            this.callbacks.onLog('system', 'Session Closed');
            this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
          },
          onerror: (e) => {
            console.error(e);
            this.callbacks.onLog('system', 'Error: ' + e.message);
            this.callbacks.onStateChange(ConnectionState.ERROR);
          }
        }
      });

      // Resolve our internal promise so input streaming can start
      this.sessionResolver(liveSession);

    } catch (error: any) {
      console.error('Connection failed:', error);
      this.callbacks.onStateChange(ConnectionState.ERROR);
      this.callbacks.onLog('system', `Connection Failed: ${error.message}`);
    }
  }

  private startAudioInput() {
    if (!this.inputAudioContext || !this.stream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    // Use ScriptProcessor for legacy browser support compatible with the examples provided
    // Ideally AudioWorklet is better, but this follows the prompt's provided pattern
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Send for visualization
      const dataArray = new Uint8Array(inputData.length);
      for(let i=0; i<inputData.length; i++) {
        dataArray[i] = Math.abs(inputData[i]) * 255; 
      }
      this.callbacks.onAudioData(dataArray);

      // Convert and send to Gemini
      const { blob } = float32ToPCM16Blob(inputData);
      
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        if (this.sessionPromise) {
            this.sessionPromise.then(session => {
                session.sendRealtimeInput({
                    media: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: base64Data
                    }
                });
            });
        }
      };
      reader.readAsDataURL(blob);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
      // Ensure time sync
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        this.outputAudioContext,
        AUDIO_SAMPLE_RATE,
        1
      );

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputNode);
      source.addEventListener('ended', () => {
        this.sources.delete(source);
      });
      source.start(this.nextStartTime);
      this.sources.add(source);
      
      this.nextStartTime += audioBuffer.duration;
    }

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.callbacks.onLog('system', 'User interrupted model.');
      this.sources.forEach(s => s.stop());
      this.sources.clear();
      this.nextStartTime = 0;
    }

    // 3. Handle Transcripts
    if (message.serverContent?.inputTranscription) {
        const text = message.serverContent.inputTranscription.text;
        if (text) {
             this.callbacks.onTranscript(text, false, 'user');
        }
    }
    if (message.serverContent?.outputTranscription) {
        const text = message.serverContent.outputTranscription.text;
        if (text) {
            this.callbacks.onTranscript(text, false, 'agent');
        }
    }

    // 4. Handle Tool Calling (RAG)
    if (message.toolCall) {
      this.callbacks.onLog('system', 'Model requesting tool use...');
      
      for (const fc of message.toolCall.functionCalls) {
        if (fc.name === 'search_knowledge_base') {
          const query = (fc.args as any).query;
          this.callbacks.onLog('rag', `Querying Knowledge Base: "${query}"`);
          
          // Execute RAG
          const result = await searchKnowledgeBase(query);
          this.callbacks.onLog('rag', `Found: ${result.substring(0, 50)}...`);

          // Send Response back
          this.sessionPromise?.then(session => {
            session.sendToolResponse({
              functionResponses: {
                id: fc.id,
                name: fc.name,
                response: { result: result }
              }
            });
          });
        }
      }
    }
  }

  disconnect() {
    if (this.sessionPromise) {
        this.sessionPromise.then(session => session.close()); // Attempt to close properly
        this.sessionPromise = null;
    }
    
    this.source?.disconnect();
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    
    this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
  }
}