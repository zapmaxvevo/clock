"use client";

import { KeyboardIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

import { trackerLabels } from "./labels";
import { useShortcutsEnabled } from "./use-tracker-shortcuts";

/** TT-26: cada tecla con el control al que equivale. */
const SHORTCUTS = [
  { key: "N", action: "Iniciar el timer" },
  { key: "S", action: "Detener el timer" },
  { key: "M", action: "Cambiar entre el modo timer y el manual" },
  { key: "C", action: "Continuar la última entrada" },
] as const;

/**
 * TT-26: los atajos se descubren acá y acá se apagan (WCAG 2.1.4). La
 * preferencia es del navegador, como el modo de TT-16.
 */
export function ShortcutsDialog() {
  const [enabled, setEnabled] = useShortcutsEnabled();

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label={trackerLabels.shortcutsTitle}
      >
        <KeyboardIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trackerLabels.shortcutsTitle}</DialogTitle>
          <DialogDescription>{trackerLabels.shortcutsHint}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.key} className="contents">
              <dt>
                <kbd className="bg-muted inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 font-mono text-xs">
                  {shortcut.key}
                </kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
        <label className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          {trackerLabels.shortcutsToggle}
        </label>
      </DialogContent>
    </Dialog>
  );
}
