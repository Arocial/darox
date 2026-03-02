'use client';

import { useChat } from '@ai-sdk/react';
import ChatInput, { SuggestionItem } from '@/components/chat-input';
import { Response } from '@/components/ai-elements/response';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect, useRef } from 'react';

export default function Chat() {
  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:8000/api/chat',
    }),
  });

  const [inputValue, setInputValue] = useState('');
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isSelectingRef = useRef(false);

  useEffect(() => {
    if (!inputValue.startsWith('/')) {
      setIsOpen(false);
      setActiveCommand(null);
      setSearchQuery('');
      return;
    }

    const parts = inputValue.slice(1).split(' ');

    if (parts.length === 1) {
      setActiveCommand(null);
      setSearchQuery(parts[0]);
    } else {
      setActiveCommand(parts[0]);
      setSearchQuery(parts[parts.length - 1]);
    }

    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      return;
    }

    setIsOpen(true);
  }, [inputValue]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const url = new URL('http://localhost:8000/api/suggestions');
        if (activeCommand) {
          url.searchParams.append('command', activeCommand);
        }
        if (searchQuery) {
          url.searchParams.append('q', searchQuery);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setItems(data.items || []);
      } catch (error) {
        console.error('Failed to fetch suggestions', error);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [activeCommand, searchQuery, isOpen]);

  const handleSelect = (selectedValue: string, item: SuggestionItem) => {
    isSelectingRef.current = true;
    if (!activeCommand) {
      setInputValue(`${item.value} `);
    } else {
      const parts = inputValue.split(' ');
      parts[parts.length - 1] = item.value;
      setInputValue(parts.join(' ') + ' ');
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
