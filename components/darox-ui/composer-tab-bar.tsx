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

function formatTabLabel(workspace: string) {
  const parts = workspace.replace(/\/+$/, '').split('/');
  const dirName = parts[parts.length - 1] || workspace;
  const parentPath = parts.length > 1 ? parts.slice(-2).join('/') : dirName;
  return { dirName, parentPath };
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
    <div className="flex flex-col border-r bg-muted/30 w-56 shrink-0 overflow-y-auto">
      <div className="flex-1">
        {tabs.map((tab) => {
          const { dirName, parentPath } = formatTabLabel(tab.workspace);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`group relative flex items-start gap-2 w-full px-3 py-2.5 text-left border-l-3 transition-colors ${
                activeId === tab.id
                  ? 'border-primary text-foreground bg-background'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium truncate" title={tab.workspace}>
                  {dirName}
                </div>
                <div
                  className="text-xs text-muted-foreground truncate"
                  title={`${tab.workspace} ${tab.id}`}
                >
                  {parentPath} {tab.id.slice(0, 6)}
                </div>
              </div>
              <span
                onClick={(e) => handleClose(e, tab.id)}
                className="mt-0.5 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity cursor-pointer shrink-0"
                aria-label="Close tab"
              >
                <XIcon className="size-3.5" />
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={handleAdd}
        className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t"
        aria-label="New composer"
        title="New composer"
      >
        <PlusIcon className="size-4" />
        <span>New</span>
      </button>
    </div>
  );
};
