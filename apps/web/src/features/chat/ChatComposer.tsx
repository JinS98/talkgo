import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import styles from './ChatPanel.module.scss';

interface ChatComposerProps {
  conversationName: string;
  draft: string;
  maxLength: number;
  canSend: boolean;
  hint: string;
  indicator?: ReactNode;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function ChatComposer({ conversationName, draft, maxLength, canSend, hint, indicator, onDraftChange, onSend, onFocus, onBlur }: ChatComposerProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  }

  return <div className={styles.composerWrap}>
    {indicator}
    <form className={styles.composer} onSubmit={submit}>
      <textarea aria-label="메시지 입력" value={draft} onChange={(event) => onDraftChange(event.target.value)} onFocus={onFocus} onBlur={onBlur} onKeyDown={handleKeyDown} maxLength={maxLength} rows={2} placeholder={`${conversationName}에 메시지 입력`} />
      <button type="submit" disabled={!canSend || !draft.trim()}>전송</button>
    </form>
    <div className={styles.composerHint}><span>{hint}</span><span>Enter 전송 · Shift+Enter 줄바꿈</span></div>
  </div>;
}
