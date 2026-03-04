import type { ConnectorDef } from "./types";

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "oura",
    label: "Oura Ring",
    description: "Sleep quality, readiness scores, and recovery data",
    icon: "/icons/oura.png",
    scope: "oura.sleep",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    description: "Conversation history, topics, and thinking patterns",
    icon: "/icons/chatgpt.svg",
    scope: "chatgpt.conversations",
  },
];
