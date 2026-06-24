export type ChatInputEventArgs = {
  req_id: string;
  normal_input: { request: boolean; user_input: string | null };
  exception_input: { exception: string | null; retry: boolean };
};

export type ChatInputEventResult = {
  client_message_id: string;
  req_id: string;
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
