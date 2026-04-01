'use client';

import { createContext, useContext } from 'react';

export const ComposerIdContext = createContext<string | null>(null);

export function useComposerId(): string {
  const id = useContext(ComposerIdContext);
  if (!id) {
    throw new Error('useComposerId must be used within a ComposerIdContext.Provider');
  }
  return id;
}
