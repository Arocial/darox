export const HISTORY_THRESHOLD = 20;
export const HISTORY_RECENT_INPUTS = 10;
export const HISTORY_SECTION_SIZE = 10;

type HistoryMessage = {
  readonly id: string;
  readonly role: string;
  readonly content: readonly {
    readonly type: string;
    readonly text?: string;
  }[];
  readonly attachments?: readonly { readonly name: string }[];
};

export type ThreadInput = {
  id: string;
  messageIndex: number;
  ordinal: number;
  text: string;
};

export type HistorySection = {
  id: string;
  start: number;
  end: number;
  firstInput: number;
  lastInput: number;
};

export function buildInputIndex(
  messages: readonly HistoryMessage[],
): ThreadInput[] {
  return messages
    .flatMap((message, messageIndex) => {
      if (message.role !== "user") return [];
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      const attachments = message.attachments
        ?.map((file) => file.name)
        .join(", ");
      return [
        {
          id: message.id,
          messageIndex,
          ordinal: 0,
          text:
            text ||
            (attachments ? `Attachment · ${attachments}` : "Attachment input"),
        },
      ];
    })
    .map((input, index) => ({ ...input, ordinal: index + 1 }));
}

export function initialHistoryCount(inputCount: number): number {
  return inputCount > HISTORY_THRESHOLD
    ? Math.floor((inputCount - HISTORY_RECENT_INPUTS) / HISTORY_SECTION_SIZE) *
        HISTORY_SECTION_SIZE
    : 0;
}

export function buildHistorySections(
  inputs: readonly ThreadInput[],
  historicalInputCount: number,
): HistorySection[] {
  const count = Math.max(
    0,
    Math.floor(
      Math.min(historicalInputCount, inputs.length - HISTORY_RECENT_INPUTS) /
        HISTORY_SECTION_SIZE,
    ) * HISTORY_SECTION_SIZE,
  );
  const sections: HistorySection[] = [];
  for (let offset = 0; offset < count; offset += HISTORY_SECTION_SIZE) {
    const end = Math.min(offset + HISTORY_SECTION_SIZE, count);
    sections.push({
      id: inputs[offset].id,
      start: offset === 0 ? 0 : inputs[offset].messageIndex,
      end: inputs[end].messageIndex,
      firstInput: offset + 1,
      lastInput: end,
    });
  }
  return sections;
}
