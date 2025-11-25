import React, { useState, useEffect, useRef } from 'react';
import { Send, HeartHandshake, User, Bot, Loader2 } from 'lucide-react';
import { GoogleGenAI, Chat } from '@google/genai';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

// Helper to safely access API key in various environments (Vite, CRA, Node, raw ESM)
const getApiKey = () => {
  try {
    // Check standard Node/CRA env
    if (typeof process !== 'undefined' && process.env?.API_KEY) {
      return process.env.API_KEY;
    }
    // Check Vite env (common on Vercel)
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_KEY) {
      return (import.meta as any).env.VITE_API_KEY;
    }
  } catch (e) {
    console.warn("Error accessing environment variables:", e);
  }
  return undefined;
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'model',
      text: "Hello, I'm Serenity. I'm here to listen and support you. How are you feeling today?"
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    const apiKey = getApiKey();

    // Security & Configuration Check
    if (!apiKey) {
      setMessages(prev => [...prev, {
        id: 'system-error',
        role: 'model',
        text: "⚠️ Configuration Missing: API Key not found.\n\nSince you are deploying to Vercel, please check your Environment Variables.\n\n1. Go to Vercel Project Settings -> Environment Variables\n2. Add Key: `API_KEY` (or `VITE_API_KEY` if using Vite)\n3. Add Value: Your Google Gemini API Key\n4. Redeploy."
      }]);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      chatRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: "You are Serenity, a warm, empathetic, and professional AI therapist. Your goal is to provide a safe, non-judgmental space for users to express their feelings. Listen actively, validate their emotions, and offer gentle, constructive guidance or coping strategies. Maintain a calm, soothing, and supportive tone. Keep your responses concise and natural, conversational. Do not provide medical diagnoses. If a user expresses intent of self-harm or danger to others, firmly but gently encourage them to seek immediate professional emergency help.",
        },
      });
    } catch (error) {
      console.error("Failed to initialize Gemini client:", error);
    }
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isLoading) return;

    // Graceful handling if chat is not initialized (e.g. missing key)
    if (!chatRef.current) {
        if (!getApiKey()) {
           // Alert is already shown by useEffect
           return;
        }
        // Attempt re-initialization or show error
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            text: "Connection not established. Please refresh the page or check your connection."
        }]);
        return;
    }

    const userText = inputText.trim();
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result = await chatRef.current.sendMessage({ message: userText });
      const responseText = result.text;
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText || "I'm listening..."
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I'm having trouble connecting right now. Please try again in a moment."
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center text-white shadow-md shadow-teal-200">
            <HeartHandshake size={16} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-700">Serenity AI</h1>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-6 overflow-y-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'
            }`}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`px-5 py-3 rounded-2xl max-w-[85%] leading-relaxed text-sm sm:text-base shadow-sm whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
               <Bot size={16} />
             </div>
             <div className="bg-white border border-slate-100 px-5 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
               <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
               <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
               <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-4 sticky bottom-0">
        <form onSubmit={handleSendMessage} className="max-w-2xl mx-auto relative flex gap-3 items-end">
          <div className="relative flex-1">
             <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type your message here..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-12 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none shadow-inner"
                rows={1}
                style={{ minHeight: '52px' }}
             />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="w-[52px] h-[52px] flex items-center justify-center bg-teal-500 text-white rounded-xl shadow-lg shadow-teal-200 hover:bg-teal-600 hover:shadow-xl hover:shadow-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-0.5" />}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-2">
          Serenity AI is an automated system and does not replace professional help.
        </p>
      </div>
    </div>
  );
};

export default App;