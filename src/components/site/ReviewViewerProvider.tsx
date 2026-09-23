"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ReviewMediaItem } from "@/lib/site/types";

export interface ViewerRequest {
  author: string;
  items: ReviewMediaItem[];
  index: number;
  /** Elemento que abriu o visualizador; recebe o foco de volta ao fechar. */
  opener: HTMLElement | null;
  /** Muda a cada abertura para reabrir mesmo com os mesmos dados. */
  token: number;
}

interface ReviewViewerContextValue {
  request: ViewerRequest | null;
  open: (author: string, items: ReviewMediaItem[], index: number, opener: HTMLElement | null) => void;
  clear: () => void;
}

const ReviewViewerContext = createContext<ReviewViewerContextValue | null>(null);

export function ReviewViewerProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ViewerRequest | null>(null);
  const tokenRef = useRef(0);

  const open = useCallback<ReviewViewerContextValue["open"]>((author, items, index, opener) => {
    tokenRef.current += 1;
    setRequest({ author, items, index, opener, token: tokenRef.current });
  }, []);

  const clear = useCallback(() => setRequest(null), []);

  const value = useMemo(() => ({ request, open, clear }), [request, open, clear]);
  return <ReviewViewerContext.Provider value={value}>{children}</ReviewViewerContext.Provider>;
}

export function useReviewViewer(): ReviewViewerContextValue {
  const context = useContext(ReviewViewerContext);
  if (!context) throw new Error("useReviewViewer precisa estar dentro de <ReviewViewerProvider>.");
  return context;
}
