export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export enum AgentState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING', // RAG Retrieval happens here
  SPEAKING = 'SPEAKING',
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'user' | 'agent' | 'system' | 'rag';
  content: string;
  metadata?: Record<string, any>;
}

export interface AudioConfig {
  sampleRate: number;
  bufferSize: number;
}

export const SYSTEM_INSTRUCTION = `You are a Senior Customer Support Agent for Nexus Enterprise.
Your goal is to resolve customer issues efficiently using the Knowledge Base.

RULES:
1. **Tool Usage**: Always use 'search_knowledge_base' to find information about:
   - Company Policies (Returns, Warranty, Privacy, Shipping)
   - Order Status (Requires Order #)
   - Company Information (About Us, Location, Hours)
   - Technical Issues
2. **Order Checking**: If a user asks "Where is my order?", ask for their Order Number. Do not guess. Once they provide a number (e.g. 12345), search for it.
3. **Identity Verification**: For sensitive account modification requests, ask for a 4-digit PIN.
4. **Precision**: Base your answers STRICTLY on the retrieved context. Do not invent policies.
5. **Tone**: Professional, polite, and efficient.
6. **Fallback**: If the tool returns no results, apologize and offer to escalate to a supervisor.
`;