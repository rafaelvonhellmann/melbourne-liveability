"use client";

import type { ReactNode } from "react";

type BottomSheetProps = {
  children: ReactNode;
  title?: string;
};

export function BottomSheet({ children, title }: BottomSheetProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 md:hidden">
      <div className="pointer-events-auto max-h-[55vh] overflow-y-auto rounded-t-2xl border border-surface-border bg-surface-raised/98 p-4 shadow-2xl backdrop-blur">
        {title && (
          <div className="mb-3 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-surface-border" aria-hidden />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
