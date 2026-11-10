"use client";

import { useTranslations } from "next-intl";

/**
 * @author: @kokonutui
 * @description: AI Prompt Input
 * @version: 2.0.0
 * @date: 2026-10-15
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { ArrowUp, Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";

interface AIPromptProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onAttach: (files: File[]) => void;
  accept: string;
  placeholder: string;
  responding: boolean;
  readingAttachment: boolean;
  canSend: boolean;
  attachment?: ReactNode;
  /** A follow-up waiting for the current reply to finish. */
  queued?: ReactNode;
  attachmentError?: string;
  /** Images attached so far, and how many fit in one message. */
  attachmentCount?: number;
  attachmentLimit?: number;
}

function SendButton({
  responding,
  canSend,
  onStop,
}: {
  responding: boolean;
  canSend: boolean;
  onStop: () => void;
}) {
  const t = useTranslations("assistantWelcome");
  // One button with two faces. The faces crossfade with a little blur, so
  // Send turning into Stop reads as the same control changing state.
  const face =
    "absolute inset-0 flex items-center justify-center transition-[opacity,filter] duration-200 motion-reduce:transition-none ease-[cubic-bezier(0.23,1,0.32,1)]";
  return (
    <button
      aria-label={responding ? t("stop") : t("send")}
      className={cn(
        "relative size-8 shrink-0 rounded-full",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        "transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        // Fills in once there is something to send, so the button says
        // "ready" before it is pressed. Stop keeps the same fill.
        responding || canSend
          ? "bg-primary text-primary-foreground hover:bg-primary/85"
          : "bg-muted text-muted-foreground"
      )}
      disabled={!(responding || canSend)}
      onClick={responding ? onStop : undefined}
      type={responding ? "button" : "submit"}
    >
      <span
        aria-hidden="true"
        className={cn(
          face,
          responding ? "opacity-0 blur-[2px]" : "opacity-100 blur-0"
        )}
      >
        <ArrowUp className="size-4" strokeWidth={2.25} />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          face,
          responding ? "opacity-100 blur-0" : "opacity-0 blur-[2px]"
        )}
      >
        <span className="size-2.5 rounded-[2px] bg-current" />
      </span>
    </button>
  );
}

export default function AIPrompt({
  value, onChange, onSubmit, onStop, onAttach, accept, placeholder,
  responding, readingAttachment, canSend, attachment, queued, attachmentError,
  attachmentCount = 0, attachmentLimit = 1,
}: AIPromptProps) {
  const t = useTranslations("assistantWelcome");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 56, maxHeight: 160 });
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const full = attachmentCount >= attachmentLimit;
  const attachmentDisabled = responding || readingAttachment || full;
  const hint = readingAttachment
    ? t("reading")
    : attachmentCount
      ? full ? t("imageLimit") : t("imageCount", { count: attachmentCount, limit: attachmentLimit })
      : responding && value.trim()
        ? t("queuedHint")
        : value.trim()
        ? t("sendHint")
        : t("hint");

  useEffect(() => {
    adjustHeight(!value);
  }, [adjustHeight, value]);

  return (
    <form
      className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <AnimatePresence initial={false}>{queued}</AnimatePresence>
      {attachmentError && <p role="alert" className="mb-2 text-xs text-destructive">{attachmentError}</p>}
      <div className="rounded-[22px] bg-muted/60 p-1">
        <div
          className={cn(
            "relative flex flex-col rounded-[18px] bg-background ring-1 ring-border",
            "has-[textarea:focus-visible]:ring-ring",
            isDragging && "ring-ring",
          )}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setIsDragging(false);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = attachmentDisabled ? "none" : "copy";
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            if (!(responding || readingAttachment)) onAttach(Array.from(event.dataTransfer.files));
          }}
        >
          {attachment && <div className="min-w-0 px-3 pt-3">{attachment}</div>}
          <Textarea
            aria-label={t("message")}
            className="min-h-14 w-full resize-none rounded-none border-none bg-transparent px-4 pt-3 pb-1 text-base shadow-none focus-visible:ring-0 sm:text-sm dark:bg-transparent"
            maxLength={4000}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            onPaste={(event) => {
              const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
              if (!images.length) return;
              event.preventDefault();
              if (!(responding || readingAttachment)) onAttach(images);
            }}
            placeholder={placeholder}
            ref={textareaRef}
            value={value}
          />
          <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
            <label className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground ring-1 ring-border hover:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring",
              attachmentDisabled && "cursor-not-allowed opacity-50",
            )} title={full ? `Up to ${attachmentLimit} images` : "Add images"}>
              <input
                accept={accept}
                aria-label={t("addImages")}
                multiple={attachmentLimit > 1}
                className="sr-only"
                disabled={attachmentDisabled}
                onChange={(event) => {
                  onAttach(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }}
                type="file"
              />
              <Plus aria-hidden="true" className="size-4" />
            </label>
            <span role="status" key={hint} className="cb-fade min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {hint}
            </span>
            <SendButton canSend={canSend} onStop={onStop} responding={responding} />
          </div>
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-content-center rounded-[inherit] bg-background/95 text-center text-sm font-medium">
              {responding ? "Wait for the reply to finish" : readingAttachment ? "Reading the images" : full ? `Up to ${attachmentLimit} images per message` : "Drop images to attach"}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
