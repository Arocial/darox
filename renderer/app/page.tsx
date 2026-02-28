'use client';

import { useChat } from '@ai-sdk/react';
import ChatInput, { SuggestionItem } from '@/components/chat-input';
import { Response } from '@/components/ai-elements/response';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect } from 'react';

export default function Chat() {
  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:8000/api/chat',
    }),
  });

  const [inputValue, setInputValue] = useState("");
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!inputValue.startsWith("/")) {
      setIsOpen(false);
      setActiveCommand(null);
      setSearchQuery("");
      return;
    }

    setIsOpen(true);
    const parts = inputValue.slice(1).split(" ");
    
    if (parts.length === 1) {
      setActiveCommand(null);
      setSearchQuery(parts[0]);
    } else {
      setActiveCommand(parts[0]);
      setSearchQuery(parts.slice(1).join(" "));
    }
  }, [inputValue]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        setTimeout(() => {
          if (!activeCommand) {
            setItems([
              { id: "1", value: "assign", label: "/assign", description: "分配给用户" },
              { id: "2", value: "label", label: "/label", description: "添加标签" },
              { id: "3", value: "status", label: "/status", description: "更新状态" },
            ].filter(item => item.value.includes(searchQuery)));
          } else if (activeCommand === "assign") {
            setItems([
              { id: "u1", value: "alice", label: "@alice", description: "前端开发" },
              { id: "u2", value: "bob", label: "@bob", description: "后端开发" },
            ].filter(item => item.value.includes(searchQuery)));
          } else if (activeCommand === "label") {
            setItems([
              { id: "l1", value: "bug", label: "bug", description: "缺陷" },
              { id: "l2", value: "feature", label: "feature", description: "新功能" },
            ].filter(item => item.value.includes(searchQuery)));
          } else {
            setItems([]);
          }
          setIsLoading(false);
        }, 200);
      } catch (error) {
        console.error("Failed to fetch suggestions", error);
        setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [activeCommand, searchQuery, isOpen]);

  const handleSelect = (selectedValue: string, item: SuggestionItem) => {
    if (!activeCommand) {
      setInputValue(`/${item.value} `);
    } else {
      setInputValue(`/${activeCommand} ${item.value} `);
      setIsOpen(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((m) => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.parts.map((part, index) => {
            if (part.type === 'text') {
              return <Response key={index}>{part.text}</Response>;
            }
          })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput 
        status={status} 
        onSubmit={(text) => sendMessage({ text })} 
        stop={stop}
        inputValue={inputValue}
        setInputValue={setInputValue}
        isOpen={isOpen}
        items={items}
        isLoading={isLoading}
        handleSelect={handleSelect}
      />
    </div>
  );
}
