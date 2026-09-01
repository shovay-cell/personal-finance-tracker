'use client';

import { useEffect } from 'react';

export interface PasteUploadOptions {
  /** Accepted MIME types or prefixes, e.g. ['image/'] or ['image/', 'application/pdf']. */
  accept: string[];
  onFile: (file: File) => void;
  /** Called with the clipboard file's MIME type when it doesn't match `accept`. */
  onUnsupported?: (mimeType: string) => void;
  enabled?: boolean;
}

function isAccepted(type: string, accept: string[]): boolean {
  return accept.some((pattern) => (pattern.endsWith('/') ? type.startsWith(pattern) : type === pattern));
}

/**
 * Ctrl+V / Cmd+V anywhere on the page while `enabled` hands a pasted image or
 * file straight to the same handler a manual upload would use — a screenshot
 * or a copied file needs no separate "browse" step. Built on the native
 * `paste` event (`ClipboardEvent.clipboardData`), not the permission-gated
 * `navigator.clipboard.read()` API, so nothing has to be granted first and it
 * only ever fires on an actual paste keystroke. Text pastes (no file on the
 * clipboard) are left alone, so typing into the modal's own fields is unaffected.
 */
export function usePasteUpload({ accept, onFile, onUnsupported, enabled = true }: PasteUploadOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;

      const files = Array.from(items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (files.length === 0) return;

      event.preventDefault();

      const supported = files.find((file) => isAccepted(file.type, accept));
      if (supported) {
        onFile(supported);
        return;
      }
      onUnsupported?.(files[0].type || '');
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [accept, onFile, onUnsupported, enabled]);
}
