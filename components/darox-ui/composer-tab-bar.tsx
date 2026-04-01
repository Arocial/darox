'use client';

import { FC } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { useComposerTabs } from '@/components/darox-ui/composer-store';

async function pickDirectory(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    return selected as string | null;
  } catch {
    // Fallback for browser (non-Tauri) environment
    const dir = prompt('Enter workspace directory path:');
    return dir || null;
  }
}

export const ComposerTabBar: FC = () => {
  const { tabs, activeId, setActiveId, createComposer, deleteComposer } =
    useComposerTabs();

  const handleAdd = async () => {
    const workspace = await pickDirectory();
    if (!workspace) return;
    await createComposer(workspace);
  };

  const handleClose = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteComposer(id);
  };

  return (
    <div className="flex items-center border-b bg-muted/30 px-1 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveId(tab.id)}
          className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-sm border-b-2 transition-colors shrink-0 ${
            activeId === tab.id
              ? 'border-primary text-foreground bg-background'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <span className="truncate max-w-[120px]" title={tab.workspace}>
            {tab.workspace}
          </span>
          <span
            className="text-[10px] text-muted-foreground"
            title={tab.id}
          >
            ({tab.id.slice(0, 6)})
          </span>
          <span
            onClick={(e) => handleClose(e, tab.id)}
            className="ml-1 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity cursor-pointer"
            aria-label="Close tab"
          >
            <XIcon className="size-3" />
          </span>
        </button>
      ))}
      <button
        onClick={handleAdd}
        className="flex items-center justify-center p-1.5 ml-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        aria-label="New composer"
        title="New composer"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
};
