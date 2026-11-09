export class SuggestionEmptyPrefix {
  private scope: string | null = null;
  private prefix: string | null = null;

  shouldSkip(scope: string, query: string): boolean {
    if (
      scope !== this.scope ||
      (this.prefix !== null && !query.startsWith(this.prefix))
    ) {
      this.reset();
    }
    this.scope = scope;
    return this.prefix !== null && query.startsWith(this.prefix);
  }

  recordEmpty(query: string) {
    this.prefix = query;
  }

  reset() {
    this.scope = null;
    this.prefix = null;
  }
}

export function suggestionQuery(command: string | null, search: string) {
  const boundary = search.lastIndexOf(" ") + 1;
  return {
    query: command ? search.slice(boundary) : search,
    argumentPrefix: search.slice(0, boundary),
  };
}
