import { create } from 'zustand';
import { initialConversation, type ConversationSelection } from '../features/chat/demoConversations';
import type { AppView } from '../types/domain';

interface WorkspaceNavigationState {
  activeView: AppView;
  selectedConversation: ConversationSelection;
  focusedTaskId: string | null;
  focusedMessageId: string | null;
  setView: (view: AppView) => void;
  selectConversation: (conversation: ConversationSelection) => void;
  openTask: (taskId: string) => void;
  openMessage: (conversation: ConversationSelection, messageId: string) => void;
  resetNavigation: () => void;
}

export const useWorkspaceNavigationStore = create<WorkspaceNavigationState>()((set) => ({
  activeView: 'chat',
  selectedConversation: initialConversation,
  focusedTaskId: null,
  focusedMessageId: null,
  setView: (activeView) => set({ activeView, focusedTaskId: null, focusedMessageId: null }),
  selectConversation: (selectedConversation) => set({
    activeView: 'chat',
    selectedConversation,
    focusedTaskId: null,
    focusedMessageId: null,
  }),
  openTask: (focusedTaskId) => set({ activeView: 'board', focusedTaskId, focusedMessageId: null }),
  openMessage: (selectedConversation, focusedMessageId) => set({ activeView: 'chat', selectedConversation, focusedMessageId, focusedTaskId: null }),
  resetNavigation: () => set({ activeView: 'chat', selectedConversation: initialConversation, focusedTaskId: null, focusedMessageId: null }),
}));
