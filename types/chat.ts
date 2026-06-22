export type ChatInputEventArgs = {
  req_id: string;
  deferred_tools: Record<string, string>; // id: question
  normal_input: { request: boolean; user_input: string | null };
  exception_input: { exception: string | null; retry: boolean };
};

export type ChatInputEventResult = {
  req_id: string;
  deferred_tools: Record<string, string>; // id: answer
  exception_input: { retry: boolean };
  normal_input: { user_input: string | null };
};

export type SuggestionItem = {
  id: string;
  value: string;
  label: string;
  description: string | null;
  source?: "history" | "dynamic";
};
