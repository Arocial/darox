import { Command } from 'cmdk';

export interface SuggestionItem {
  id: string;
  value: string;
  label: string;
  description?: string;
}

export default function ChatInput({
  status,
  onSubmit,
  stop,
  inputValue,
  setInputValue,
  isOpen,
  setIsOpen,
  items,
  isLoading,
  handleSelect,
}: {
  status: string;
  onSubmit: (text: string) => void;
  stop?: () => void;
  inputValue: string;
  setInputValue: (val: string) => void;
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  items: SuggestionItem[];
  isLoading: boolean;
  handleSelect: (val: string, item: SuggestionItem) => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
    if (e.key === 'Enter' && (!isOpen || items.length === 0)) {
      e.preventDefault();
      if (inputValue.trim() === '') return;
      onSubmit(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="fixed bottom-0 w-full max-w-md mb-8">
      <Command shouldFilter={false} className="relative w-full">
        {isOpen && (items.length > 0 || isLoading) && (
          <div className="absolute bottom-full mb-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
            <Command.List className="max-h-60 overflow-y-auto p-2">
              {isLoading && items.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500">
                  加载中...
                </div>
              )}
              {items.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.value}
                  onSelect={() => handleSelect(item.value, item)}
                  className="px-3 py-2 cursor-pointer rounded-md flex flex-col aria-selected:bg-blue-50 aria-selected:text-blue-900"
                >
                  <span className="font-medium">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-gray-500 mt-0.5">
                      {item.description}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </div>
        )}

        <Command.Input
          value={inputValue}
          onValueChange={setInputValue}
          onKeyDown={handleKeyDown}
          disabled={status !== 'ready'}
          placeholder="Say something..."
          className="w-full p-2 border border-gray-300 rounded shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </Command>
      {stop && (status === 'streaming' || status === 'submitted') && (
        <button
          className="absolute inset-0 w-full p-2 border border-gray-300 rounded shadow-xl bg-white"
          type="button"
          onClick={stop}
        >
          Stop
        </button>
      )}
    </div>
  );
}
