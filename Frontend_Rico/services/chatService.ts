import { BACKEND_URL } from "@/constants/Gemini";
import { getAuthHeaders, handleUnauthorizedToken } from "@/services/authService";

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: number;
}

const CHAT_URL = `${BACKEND_URL}/api/chat`;

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) await handleUnauthorizedToken();
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Server error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${CHAT_URL}/conversations`, { headers });
  return handleResponse<Conversation[]>(res);
}

export async function fetchConversationMessages(id: string): Promise<ChatMessage[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${CHAT_URL}/conversations/${id}/messages`, { headers });
  return handleResponse<ChatMessage[]>(res);
}
