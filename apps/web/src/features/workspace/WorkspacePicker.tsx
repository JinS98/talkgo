import { useEffect, useRef, useState } from 'react';
import type { Membership } from './workspaceTypes';
import styles from './WorkspaceGate.module.scss';

export function WorkspacePicker({ selected, workspaces, onSelect }: { selected: Membership; workspaces: Membership[]; onSelect: (workspaceId: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className={styles.workspacePicker} ref={rootRef}>
    <button ref={buttonRef} type="button" aria-label="워크스페이스 선택" aria-expanded={open} aria-controls="workspace-options" onClick={() => setOpen((value) => !value)}>
      <span className={styles.pickerIcon} aria-hidden="true">{selected.name.charAt(0).toUpperCase()}</span>
      <span className={styles.pickerName}>{selected.name}</span>
      <svg className={styles.pickerMark} aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 7.5 5 5 5-5" /></svg>
    </button>
    {open && <div id="workspace-options" className={styles.pickerOptions} role="group" aria-label="워크스페이스 목록">
      {workspaces.map((item) => <button type="button" key={item.workspaceId} className={item.workspaceId === selected.workspaceId ? styles.selectedOption : ''} aria-current={item.workspaceId === selected.workspaceId ? 'true' : undefined} onClick={() => { setOpen(false); onSelect(item.workspaceId); }}>
        <span className={styles.pickerIcon} aria-hidden="true">{item.name.charAt(0).toUpperCase()}</span>
        <span>{item.name}</span>
      </button>)}
    </div>}
  </div>;
}
