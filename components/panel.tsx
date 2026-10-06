"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
export function Panel({ open, onOpenChange, title, description, children, wide = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="panel-overlay"/><Dialog.Content className={`panel ${wide ? "panel-wide" : ""}`}><div className="panel-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Close panel"><XIcon size={20}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
