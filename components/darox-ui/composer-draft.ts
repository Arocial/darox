type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type DraftComposer = {
  getState: () => { readonly text: string };
  setText: (text: string) => void;
};

export function composerDraftKey(
  backendId: string,
  sessionPath: string,
): string {
  return `darox_composer_draft:${JSON.stringify([backendId, sessionPath])}`;
}

export function bindComposerDraft(
  storage: DraftStorage,
  key: string,
  composer: DraftComposer,
  subscribe: (listener: () => void) => () => void,
): () => void {
  try {
    const saved = storage.getItem(key);
    if (saved !== null && !composer.getState().text) composer.setText(saved);
  } catch {}

  let previousText = composer.getState().text;
  return subscribe(() => {
    const text = composer.getState().text;
    if (text === previousText) return;
    try {
      if (text) storage.setItem(key, text);
      else storage.removeItem(key);
      previousText = text;
    } catch {}
  });
}
