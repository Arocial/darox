export type ChatInputEventResult = {
  client_message_id: string;
  user_input: string | null;
};

export type SuggestionItem = {
  id: string;
  value: string;
  label: string;
  description: string | null;
  source?: "history" | "dynamic";
};
