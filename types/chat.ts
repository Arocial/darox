export type ChatInputEventArgs = {
  req_id: string;
  normal_input: boolean;
};

export type ChatInputEventResult = {
  client_message_id: string;
  req_id: string;
  user_input: string | null;
};

export type SuggestionItem = {
  id: string;
  value: string;
  label: string;
  description: string | null;
  source?: "history" | "dynamic";
};
