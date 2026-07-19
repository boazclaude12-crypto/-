"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ChevronLeft, Loader2, BarChart3, ArrowDownCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { triggerUpgradeModal } from "../../components/Header";

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'שלום! אני אשף המסחר, כיצד אוכל לעזור לך היום?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string>("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);

  // Check user auth and plan status on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/?auth=login');
          return;
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('plan_id, avatar_url')
          .eq('user_id', user.id)
          .single();
        if (!profile?.plan_id) {
          triggerUpgradeModal();
          router.push('/dashboard');
          return;
        }
        //Get plan data
        const {data:planData} = await supabase
        .from('plans')
        .select('daily_chat_limit')
        .eq('id', profile.plan_id)
        .single();
        if(planData?.daily_chat_limit == 0)
        {
          router.push("/dashboard");
         return;
        }
        setAvatar(profile.avatar_url || "");
        if (!conversationId) {
          setConversationId(user.id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router, supabase, conversationId]);

  // Monitor scroll to show/hide "scroll to bottom" button
  useEffect(() => {
    const handleScroll = () => {
      if (!messagesContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      setShowScrollButton(scrollTop + clientHeight < scrollHeight - 20);
    };
    const container = messagesContainerRef.current;
    container?.addEventListener("scroll", handleScroll);
    return () => container?.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // (Optional) Load chat history for the current conversation
  useEffect(() => {
    async function fetchHistory() {
      if (!conversationId) return;
      try {
        const res = await fetch(`/api/ask/history?conversationId=${conversationId}`);
        const data = await res.json();
        if (data.history && data.history.length > 0) {
          const loadedMessages = data.history.map((msg: any) => ({
            id: msg.id,
            type: msg.message_type,
            content: msg.content,
            timestamp: new Date(msg.created_at),
          }));
          // Append history to current messages (preserving the default message)
          setMessages((prev) => [...prev, ...loadedMessages]);
        }
      } catch (error) {
        console.error("Error fetching history:", error);
      }
    }
    fetchHistory();
  }, [conversationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');

    // Ensure the typing indicator is visible for at least 1.5 seconds
    const startTime = Date.now();
    setIsTyping(true);

    try {
      const res = await fetch('/api/ask/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conversationId: conversationId, 
          message: currentInput 
        }),
      });
      const data = await res.json();
      if (data.reply) {
        if (!conversationId && data.conversationId) {
          setConversationId(data.conversationId);
        }
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: data.reply,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error: any) {
      console.error(error);
    } finally {
      const elapsed = Date.now() - startTime;
      const minDelay = 1500; // 1.5 seconds minimum for typing indicator
      const remaining = minDelay - elapsed;
      setTimeout(() => {
        setIsTyping(false);
        scrollToBottom();
      }, remaining > 0 ? remaining : 0);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white to-amber-50/50">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-amber-100 flex flex-col items-center justify-center w-11/12 max-w-md">
          <div className="mb-6 relative">
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
              <Loader2 className="h-10 w-10 text-amber-500" />
              <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin"></div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center mb-3 text-amber-500">אשף המסחר</h1>
          <p className="text-gray-600 mb-4">אנחנו מכינים את המערכת בשבילך...</p>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-amber-500 rounded-full animate-pulse-width"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      
      {/* Fixed Header */}
      <header className="bg-white border-b fixed top-0 left-0 w-full z-50 shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-amber-500 flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                אשף המסחר
              </Link>
              <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <ChevronLeft className="h-5 w-5" />
                חזרה לדאשבורד
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Padding for Fixed Header */}
      <main className="flex-1 flex flex-col bg-gradient-to-b from-gray-50 to-white pt-20">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex items-center justify-center">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">שאל את אשף המסחר</h1>
              <p className="text-gray-600">
                שאל שאלות על ניתוח טכני וקבל תשובות מקצועיות
              </p>
            </div>
          </div>
        </div>

        {/* Chat Container */}
        <div ref={messagesContainerRef} className="flex-1 flex flex-col overflow-y-auto px-4 relative">
          <div className="container mx-auto max-w-4xl space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-4 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.type === 'user'
                    ? 'bg-amber-100'
                    : 'bg-gradient-to-br from-amber-400 to-amber-500'
                }`}>
                  {message.type === 'user' ? (
                    avatar ? (
                      <img src={avatar} alt="User Avatar" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-amber-500" />
                    )
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </div>
                <div className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                  message.type === 'user'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white shadow-sm border border-gray-100'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <span className="text-xs mt-1 block text-gray-500">
                    {message.timestamp.toLocaleTimeString('he-IL')}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Floating Scroll to Bottom Button */}
        {showScrollButton && (
          <button onClick={scrollToBottom} className="fixed bottom-20 right-6 bg-amber-500 text-white p-3 rounded-full shadow-md hover:bg-amber-600 transition">
            <ArrowDownCircle className="h-6 w-6" />
          </button>
        )}

        {/* Typing Animation */}
        {isTyping && (
        <div className="flex items-center gap-4 p-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-500">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-4 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          <span className="text-gray-500">מנתח...</span>
        </div>
        )}
        {/* Input Area */}
        <div className="border-t bg-white py-4">
          <div className="container mx-auto px-4 max-w-4xl">
            <form onSubmit={handleSubmit} className="flex gap-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="שאל את האשף..."
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                disabled={isTyping}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 ${
                  input.trim() && !isTyping
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span>שלח</span>
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
