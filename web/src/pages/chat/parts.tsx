import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowUp, Sparkles } from "lucide-react";

import { dayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The pieces every thread in the chat page shares.
 *
 * There are three threads now -- a conversation, the pinned Sahaya updates,
 * and Ask Sahaya -- and the bubble geometry and the composer must be identical
 * in all of them. The composer in particular carries a set of rules that were
 * each learned the hard way (16px text so iOS does not zoom, safe-area padding
 * so the send button clears the home bar, Enter that does not send mid-IME
 * composition), and a second copy of it would lose one of them within a month.
 */

/** The pinned thread's avatar: the wordmark's full stop, in a moss circle. */
export function SahayaMark({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className="grid shrink-0 place-items-center rounded-full bg-moss font-display font-extrabold leading-none tracking-[-0.03em] text-on-moss"
    >
      s.
    </span>
  );
}

/** Ask Sahaya's avatar. A glyph rather than the wordmark, so the two pinned
 *  rows cannot be mistaken for each other at a glance. */
export function AskMark({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-sage text-on-moss"
    >
      <Sparkles style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={1.75} />
    </span>
  );
}

export function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[12px] font-medium text-ink-faint">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {dayLabel(iso)}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Phones show the list or a thread, never both; this is the way back. */
export function BackToList() {
  return (
    <Link
      to="/messages"
      aria-label="Back to all messages"
      className="-ml-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-oat md:hidden"
    >
      <ArrowLeft className="size-5" aria-hidden />
    </Link>
  );
}

/**
 * One message.
 *
 * Takes the parts it draws rather than a message object: what counts as "mine"
 * and what belongs in the meta line differ between a conversation (time, Seen,
 * retry) and Ask Sahaya (time only), but the shape, colours and grouping must
 * not differ at all.
 */
export function Bubble({
  body,
  mine,
  joinsPrevious,
  meta,
  faded = false,
  children,
}: {
  body: string;
  mine: boolean;
  joinsPrevious: boolean;
  meta?: ReactNode;
  /** Sent but not yet confirmed. */
  faded?: boolean;
  /** Anything that belongs under the bubble, inside its column -- the
   *  assistant's proposal cards. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex",
        mine ? "justify-end" : "justify-start",
        joinsPrevious ? "mt-1" : "mt-3",
      )}
    >
      <div
        className={cn(
          "flex max-w-[80%] flex-col sm:max-w-[65%]",
          mine ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug",
            mine ? "rounded-br-[6px] bg-moss text-on-moss" : "rounded-bl-[6px] bg-oat text-ink",
            faded && "opacity-70",
          )}
        >
          {body}
        </div>
        {children}
        {meta && <p className="mt-1 px-1 text-[11px] text-ink-faint">{meta}</p>}
      </div>
    </div>
  );
}

/**
 * The composer. Grows with the text to a ceiling, then scrolls.
 *
 * `onTyping` is optional: a conversation announces typing over the socket, and
 * Ask Sahaya has nobody to announce it to.
 */
export function Composer({
  placeholder,
  onSend,
  onTyping,
  disabled = false,
  maxLength = 2000,
}: {
  placeholder: string;
  onSend: (body: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  function fit() {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    const body = text.trim();
    if (!body || disabled) return;
    onSend(body);
    setText("");
    window.requestAnimationFrame(fit);
    area.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends and Shift+Enter is a new line -- but never while an input
    // method is composing: Malayalam keyboards use Enter to commit a word,
    // and sending half a word is the bug that makes a chat unusable for them.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 border-t border-line-soft p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4"
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <textarea
        id={id}
        ref={area}
        rows={1}
        maxLength={maxLength}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          fit();
          if (event.target.value.trim()) onTyping?.();
        }}
        onKeyDown={onKeyDown}
        className="max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-field bg-oat px-4 py-2.5 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-moss sm:text-[15px]"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={disabled || !text.trim()}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-moss text-on-moss transition-colors duration-200 hover:bg-moss-hover disabled:opacity-40"
      >
        <ArrowUp className="size-5" aria-hidden />
      </button>
    </form>
  );
}
