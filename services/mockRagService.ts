import { FunctionDeclaration, Type } from '@google/genai';

/**
 * Mock CRM and Knowledge Base for Call Center Demo.
 * In production, this connects to Salesforce, Zendesk, or a Vector DB.
 */

// Define the shape of our mock database entries
export interface DatabaseEntry {
  id: string;
  category: 'Policy' | 'Order' | 'Info' | 'Tech';
  keywords: string[];
  content: string;
  addedAt: number;
}

// Initial Hardcoded Data
const INITIAL_DATA: DatabaseEntry[] = [
  // --- Policies ---
  {
    id: 'pol-1',
    category: 'Policy',
    keywords: ["return", "refund", "exchange", "back"],
    content: "POLICY_REFUND_V4: Items can be returned within 30 days of receipt. Items must be unworn with tags. Electronics have a 15% restocking fee unless defective. Processing time: 3-5 business days.",
    addedAt: Date.now()
  },
  {
    id: 'pol-2',
    category: 'Policy',
    keywords: ["shipping", "delivery", "arrive", "long", "wait"],
    content: "POLICY_SHIPPING: Standard shipping is 5-7 business days. Express is 2 days. We currently have delays in the North Atlantic region due to weather.",
    addedAt: Date.now()
  },
  {
    id: 'pol-3',
    category: 'Policy',
    keywords: ["privacy", "data", "gdpr", "personal info"],
    content: "POLICY_PRIVACY: We collect minimal data required for order fulfillment. We do not sell data to third parties. We are fully GDPR and CCPA compliant.",
    addedAt: Date.now()
  },
  {
    id: 'pol-4',
    category: 'Policy',
    keywords: ["warranty", "guarantee", "broken", "repair"],
    content: "POLICY_WARRANTY: All electronics come with a 1-year limited warranty covering manufacturer defects. Accidental damage (drops/spills) is not covered.",
    addedAt: Date.now()
  },
  
  // --- Orders ---
  {
    id: 'ord-1',
    category: 'Order',
    keywords: ["12345"],
    content: "CRM_ORDER_LOOKUP: Order #12345 for John Doe. Status: SHIPPED. Carrier: Fedex. Tracking: FX8842994. Est Delivery: Tomorrow.",
    addedAt: Date.now()
  },
  {
    id: 'ord-2',
    category: 'Order',
    keywords: ["99999"],
    content: "CRM_ORDER_LOOKUP: Order #99999 for Jane Smith. Status: PROCESSING. Warehouse: Atlanta. Est Delivery: 3-4 days.",
    addedAt: Date.now()
  },
  {
    id: 'ord-3',
    category: 'Order',
    keywords: ["order status", "where is my order", "track order", "my order", "check order"],
    content: "SCRIPT_ORDER_CHECK: I can check that for you. May I have your 5-digit Order Number? (Valid mock numbers for demo: 12345, 99999)",
    addedAt: Date.now()
  },

  // --- Company Info ---
  {
    id: 'info-1',
    category: 'Info',
    keywords: ["about", "nexus", "who are you", "what is this company", "mission"],
    content: "INFO_COMPANY: Nexus Enterprise is a leading provider of cloud-native hardware solutions founded in 2020. Our mission is to democratize server-grade connectivity for small businesses.",
    addedAt: Date.now()
  },
  {
    id: 'info-2',
    category: 'Info',
    keywords: ["hq", "headquarters", "location", "address", "located", "office"],
    content: "INFO_LOCATION: Nexus Enterprise HQ is located at 123 Tech Plaza, San Francisco, CA 94105.",
    addedAt: Date.now()
  },
  {
    id: 'info-3',
    category: 'Info',
    keywords: ["hours", "open", "close", "time"],
    content: "INFO_HOURS: We are open Monday to Friday, 9 AM to 9 PM EST. Weekends 10 AM to 6 PM.",
    addedAt: Date.now()
  },
  
  // --- Tech Support ---
  {
    id: 'tech-1',
    category: 'Tech',
    keywords: ["503", "error", "unavailable"],
    content: "KB_TECH_503: Service Unavailable. Common cause: Load Balancer saturation. Fix: Check 'Status Page' for outages. If no outage, escalate to Level 2 Support.",
    addedAt: Date.now()
  },
  {
    id: 'tech-2',
    category: 'Tech',
    keywords: ["router", "light", "blinking", "wifi"],
    content: "KB_HARDWARE_ROUTER: If the 'Link' light is blinking orange, it means no downstream signal. Instruct customer to unplug power for 30 seconds (Power Cycle).",
    addedAt: Date.now()
  }
];

// Runtime Database State
// Try to load from localStorage to persist Admin changes across reloads
let runtimeDatabase: DatabaseEntry[] = [];

try {
    const saved = localStorage.getItem('nexus_rag_db');
    if (saved) {
        runtimeDatabase = JSON.parse(saved);
    } else {
        runtimeDatabase = [...INITIAL_DATA];
    }
} catch (e) {
    runtimeDatabase = [...INITIAL_DATA];
}

const saveDatabase = () => {
    try {
        localStorage.setItem('nexus_rag_db', JSON.stringify(runtimeDatabase));
    } catch (e) {
        console.error("Failed to save DB", e);
    }
}

// --- Admin Methods ---

export const getDatabaseEntries = (): DatabaseEntry[] => {
    return [...runtimeDatabase].sort((a, b) => b.addedAt - a.addedAt);
};

export const addDatabaseEntry = (category: DatabaseEntry['category'], keywords: string[], content: string) => {
    const newEntry: DatabaseEntry = {
        id: Math.random().toString(36).substr(2, 9),
        category,
        keywords: keywords.map(k => k.toLowerCase().trim()),
        content,
        addedAt: Date.now()
    };
    runtimeDatabase.push(newEntry);
    saveDatabase();
    console.log("[RAG Service] New entry added:", newEntry);
    return newEntry;
};

export const deleteDatabaseEntry = (id: string) => {
    runtimeDatabase = runtimeDatabase.filter(e => e.id !== id);
    saveDatabase();
};

export const resetDatabase = () => {
    runtimeDatabase = [...INITIAL_DATA];
    saveDatabase();
};

// --- RAG Logic ---

export const searchToolDeclaration: FunctionDeclaration = {
  name: 'search_knowledge_base',
  parameters: {
    type: Type.OBJECT,
    description: 'Search the internal knowledge base for policies, order details, company info, or technical solutions.',
    properties: {
      query: {
        type: Type.STRING,
        description: 'Keywords to search (e.g., "return policy", "order 12345", "about nexus").',
      },
    },
    required: ['query'],
  },
};

export const searchKnowledgeBase = async (query: string): Promise<string> => {
  console.log(`[RAG Service] Searching for: "${query}"`);
  
  // Simulate database latency
  await new Promise(resolve => setTimeout(resolve, 600));

  const lowerQuery = query.toLowerCase();
  
  // Smart keyword matching: Find entry where ANY of its keywords are inside the query
  const matches = runtimeDatabase.filter(entry => 
    entry.keywords.some(keyword => lowerQuery.includes(keyword))
  );

  if (matches.length > 0) {
    // If multiple matches, return the most relevant or combine them (simplified here: return first/best match)
    // In a real vector DB, we would rank by similarity score.
    // Here we return the longest match content to ensure detail.
    return matches[0].content;
  }

  // Fallback if user asks generally about "policies" without specifying
  if (lowerQuery.includes("policy")) {
      return "INDEX_POLICIES: Available policies: Return Policy, Privacy Policy, Shipping Policy, Warranty Policy. Please specify which one you need.";
  }

  return "RAG_SEARCH_RESULT: No specific document found. Please ask the user for more details (e.g., specific error code, order number) or offer to escalate the ticket.";
};