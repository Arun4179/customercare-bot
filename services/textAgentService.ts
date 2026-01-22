import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { searchToolDeclaration, searchKnowledgeBase } from "./mockRagService";
import { SYSTEM_INSTRUCTION } from "../types";

export const processTextQuery = async (
    query: string, 
    onLog: (type: 'user' | 'agent' | 'system' | 'rag', msg: string) => void,
    onToken: (text: string) => void
): Promise<{ text: string, audioBase64: string }> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY not found in environment");
    const ai = new GoogleGenAI({ apiKey });

    // 1. Get Text Answer using Chat + RAG (Gemini 2.5 Flash)
    onLog('system', 'Processing query with Gemini 2.5 Flash...');
    
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: [searchToolDeclaration] }],
        }
    });

    onLog('system', 'Sending query to model...');

    // Helper to consume a stream and extract text/tools
    const consumeStream = async (streamResult: AsyncGenerator<GenerateContentResponse>) => {
        let textAcc = "";
        let funcCalls: any[] = [];
        
        for await (const chunk of streamResult) {
             const t = chunk.text;
             if (t) {
                 textAcc += t;
                 onToken(t);
             }
             const fc = chunk.functionCalls;
             if (fc && fc.length > 0) {
                 funcCalls.push(...fc);
             }
        }
        return { textAcc, funcCalls };
    };

    // First Turn: Send user message
    const stream1 = await chat.sendMessageStream({ message: query });
    let { textAcc, funcCalls } = await consumeStream(stream1);

    // Handle Function Calls (Single-turn loop for demo simplicity)
    if (funcCalls.length > 0) {
        for (const fc of funcCalls) {
             if (fc.name === 'search_knowledge_base') {
                const q = (fc.args as any).query;
                onLog('rag', `Querying Knowledge Base: "${q}"`);
                
                const result = await searchKnowledgeBase(q);
                onLog('rag', `Retrieved info. Sending to model...`);
                
                // Send tool response back to model to get the final answer
                // Use stream again for the answer
                const stream2 = await chat.sendMessageStream({
                    message: [{
                        functionResponse: {
                            name: fc.name,
                            response: { result: result }
                        }
                    }]
                });
                
                // Accumulate the new text (the answer based on the tool)
                const outcome = await consumeStream(stream2);
                textAcc += outcome.textAcc;
             }
        }
    }

    const answerText = textAcc || "I processed your request but couldn't generate a text response.";

    // 2. Convert the Answer to Speech (Gemini 2.5 Flash TTS)
    // Note: TTS via generateContent is not streaming, so we wait for full text.
    // For a better experience, we could chunk the text, but for this demo, the text streams first, then audio plays.
    onLog('system', 'Synthesizing speech from response...');
    const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: answerText }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) {
        throw new Error("Failed to generate speech audio");
    }

    return { text: answerText, audioBase64 };
}