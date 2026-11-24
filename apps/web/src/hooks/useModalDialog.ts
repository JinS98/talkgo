import { useEffect, useRef } from 'react';

/** Keeps a native dialog in sync with its owner's open state. */
export function useModalDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);

  return dialogRef;
}
