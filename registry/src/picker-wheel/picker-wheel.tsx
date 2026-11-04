"use client"

import * as React from "react"
import { Sheet, spring } from "scrollsheet"
import { animateScrollTo, type ScrollAnimation } from "scrollsheet/motion"

interface PickerOption {
  value: string
  label: string
}

interface PickerColumnSpec {
  id: string
  /** Accessible name of the column, for example "Month". */
  label: string
  options: readonly PickerOption[]
}

const ITEM_HEIGHT = 40
const VISIBLE_ITEMS = 5
const PAGE = VISIBLE_ITEMS - 1
// One spring sets the duration of every programmatic move.
const SETTLE_MS = spring({ stiffness: 320, damping: 34 }).durationMs

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

interface PickerColumnProps {
  label: string
  options: readonly PickerOption[]
  value: string | undefined
  onValueChange: (value: string) => void
}

/**
 * One wheel: a scroll-snap track whose resting position is the value. The
 * browser owns the touch physics. This component only reads where the track
 * settles and moves it for keys, taps, and external value changes.
 */
function PickerColumn({ label, options, value, onValueChange }: PickerColumnProps) {
  const uid = React.useId()
  const trackRef = React.useRef<HTMLDivElement>(null)
  const animation = React.useRef<ScrollAnimation | null>(null)
  const settleTimer = React.useRef(0)
  const typeahead = React.useRef({ buffer: "", timer: 0 })
  const mounted = React.useRef(false)

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )
  const [centered, setCentered] = React.useState(selectedIndex)

  const indexAt = React.useCallback(
    (el: HTMLElement) =>
      Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT))),
    [options.length]
  )

  const scrollToIndex = React.useCallback((index: number, animate: boolean) => {
    const el = trackRef.current
    if (!el) return
    animation.current?.cancel()
    animation.current = null
    const top = index * ITEM_HEIGHT
    if (!animate || prefersReducedMotion()) {
      el.scrollTo({ top, behavior: "instant" })
      return
    }
    const run = animateScrollTo(el, top, SETTLE_MS, "y")
    animation.current = run
    void run.finished.then(() => {
      if (animation.current === run) animation.current = null
    })
  }, [])

  const commit = React.useCallback(
    (index: number) => {
      const option = options[index]
      if (option && option.value !== value) onValueChange(option.value)
    },
    [options, value, onValueChange]
  )

  // Follow external value and option changes, but never fight a live gesture.
  React.useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    setCentered(selectedIndex)
    if (animation.current) return
    const sync = () => {
      if (indexAt(el) !== selectedIndex || el.scrollTop % ITEM_HEIGHT !== 0) {
        scrollToIndex(selectedIndex, mounted.current)
      }
      mounted.current = true
    }
    if (el.clientHeight > 0) {
      sync()
      return
    }
    // Mounted inside a dialog that is not laid out yet: a scroll would clamp to 0.
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === 0) return
      observer.disconnect()
      sync()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [selectedIndex, options, indexAt, scrollToIndex])

  // A scroll that settles on a row commits it. Programmatic moves are
  // committed by whoever started them.
  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const settle = () => {
      if (animation.current) return
      setCentered(indexAt(el))
      commit(indexAt(el))
    }
    const onScroll = () => {
      setCentered(indexAt(el))
      if (!Reflect.has(window, "onscrollend")) {
        window.clearTimeout(settleTimer.current)
        settleTimer.current = window.setTimeout(settle, 120)
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("scrollend", settle)
    return () => {
      window.clearTimeout(settleTimer.current)
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("scrollend", settle)
    }
  }, [indexAt, commit])

  React.useEffect(
    () => () => {
      animation.current?.cancel()
      window.clearTimeout(typeahead.current.timer)
    },
    []
  )

  function choose(index: number) {
    const next = Math.min(options.length - 1, Math.max(0, index))
    setCentered(next)
    scrollToIndex(next, true)
    commit(next)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    switch (event.key) {
      case "ArrowDown":
        choose(selectedIndex + 1)
        break
      case "ArrowUp":
        choose(selectedIndex - 1)
        break
      case "PageDown":
        choose(selectedIndex + PAGE)
        break
      case "PageUp":
        choose(selectedIndex - PAGE)
        break
      case "Home":
        choose(0)
        break
      case "End":
        choose(options.length - 1)
        break
      default: {
        if (event.key.length !== 1) return
        const state = typeahead.current
        window.clearTimeout(state.timer)
        state.buffer += fold(event.key)
        state.timer = window.setTimeout(() => (state.buffer = ""), 600)
        const hit = options.findIndex((option) => fold(option.label).startsWith(state.buffer))
        if (hit >= 0) choose(hit)
        return
      }
    }
    event.preventDefault()
  }

  return (
    <div
      ref={trackRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-activedescendant={`${uid}-${selectedIndex}`}
      data-slot="picker-wheel-column"
      data-scrollsheet-no-drag
      onKeyDown={onKeyDown}
      style={{
        position: "relative",
        boxSizing: "border-box",
        flex: "1 1 0",
        minWidth: 0,
        height: ITEM_HEIGHT * VISIBLE_ITEMS,
        paddingBlock: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
        overflowY: "auto",
        scrollSnapType: "y mandatory",
        // The wheel never hands its overscroll to the sheet underneath.
        overscrollBehavior: "contain",
        scrollbarWidth: "none",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
        maskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
      }}
      className="[&::-webkit-scrollbar]:hidden focus-visible:ring-ring rounded-md outline-none focus-visible:ring-2"
    >
      {options.map((option, index) => {
        const distance = Math.abs(index - centered)
        return (
          <div
            key={option.value}
            id={`${uid}-${index}`}
            role="option"
            aria-selected={index === selectedIndex}
            data-slot="picker-wheel-item"
            data-centered={index === centered ? "" : undefined}
            onClick={() => choose(index)}
            style={{
              height: ITEM_HEIGHT,
              scrollSnapAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              userSelect: "none",
              opacity: distance === 0 ? 1 : distance === 1 ? 0.55 : 0.3,
            }}
            className="text-lg tabular-nums transition-opacity motion-reduce:transition-none"
          >
            {option.label}
          </div>
        )
      })}
    </div>
  )
}

interface PickerWheelProps {
  columns: readonly PickerColumnSpec[]
  value: readonly string[]
  onValueChange: (value: string[]) => void
  className?: string
}

/** Side-by-side wheels with a shared selection band. */
function PickerWheel({ columns, value, onValueChange, className }: PickerWheelProps) {
  return (
    <div
      role="group"
      data-slot="picker-wheel"
      style={{ position: "relative", display: "flex", gap: 4 }}
      className={className}
    >
      <div
        aria-hidden="true"
        data-slot="picker-wheel-band"
        style={{
          position: "absolute",
          insetInline: 0,
          top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
          height: ITEM_HEIGHT,
          pointerEvents: "none",
        }}
        className="bg-muted rounded-lg"
      />
      {columns.map((column, index) => (
        <PickerColumn
          key={column.id}
          label={column.label}
          options={column.options}
          value={value[index]}
          onValueChange={(next) => {
            const copy = [...value]
            copy[index] = next
            onValueChange(copy)
          }}
        />
      ))}
    </div>
  )
}

interface PickerSheetProps {
  title: string
  /** Static columns, or a function of the draft for dependent columns. */
  columns: readonly PickerColumnSpec[] | ((draft: string[]) => readonly PickerColumnSpec[])
  value: readonly string[]
  /** Called with the draft when Done is pressed. */
  onValueChange: (value: string[]) => void
  /** Adjusts the draft after each change, for example to clamp a day. */
  normalize?: (draft: string[]) => string[]
  /** Rendered through Sheet.Trigger asChild. */
  trigger: React.ReactElement
  doneLabel?: string
  cancelLabel?: string
}

/** A bottom sheet with Cancel and Done around a PickerWheel. */
function PickerSheet({
  title,
  columns,
  value,
  onValueChange,
  normalize,
  trigger,
  doneLabel = "Done",
  cancelLabel = "Cancel",
}: PickerSheetProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Sheet.Root open={open} onOpenChange={setOpen}>
      <Sheet.Trigger asChild>{trigger}</Sheet.Trigger>
      <Sheet.Content data-slot="picker-sheet-content" className="bg-background rounded-t-xl">
        <PickerPanel
          title={title}
          columns={columns}
          initial={value}
          normalize={normalize}
          doneLabel={doneLabel}
          cancelLabel={cancelLabel}
          onCancel={() => setOpen(false)}
          onDone={(next) => {
            onValueChange(next)
            setOpen(false)
          }}
        />
      </Sheet.Content>
    </Sheet.Root>
  )
}

interface PickerPanelProps {
  title: string
  columns: PickerSheetProps["columns"]
  initial: readonly string[]
  normalize: PickerSheetProps["normalize"]
  doneLabel: string
  cancelLabel: string
  onCancel: () => void
  onDone: (value: string[]) => void
}

function PickerPanel({
  title,
  columns,
  initial,
  normalize,
  doneLabel,
  cancelLabel,
  onCancel,
  onDone,
}: PickerPanelProps) {
  const [draft, setDraft] = React.useState<string[]>(() => [...initial])
  const resolved = typeof columns === "function" ? columns(draft) : columns
  return (
    <>
      <Sheet.Handle />
      <div
        data-slot="picker-sheet-header"
        className="flex items-center justify-between px-4 pb-2"
      >
        <button type="button" onClick={onCancel} className="text-muted-foreground h-11 text-sm">
          {cancelLabel}
        </button>
        <Sheet.Title className="text-base font-semibold">{title}</Sheet.Title>
        <button type="button" onClick={() => onDone(draft)} className="h-11 text-sm font-semibold">
          {doneLabel}
        </button>
      </div>
      <PickerWheel
        columns={resolved}
        value={draft}
        onValueChange={(next) => setDraft(normalize ? normalize(next) : next)}
        className="px-4 pb-6"
      />
    </>
  )
}

interface DatePickerSheetProps {
  value?: Date | null
  onValueChange: (date: Date) => void
  minYear?: number
  maxYear?: number
  locale?: string
  title?: string
  placeholder?: string
  className?: string
}

function daysIn(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** Month, day, and year wheels in the order the locale writes them. */
function DatePickerSheet({
  value,
  onValueChange,
  minYear = new Date().getFullYear() - 100,
  maxYear = new Date().getFullYear() + 10,
  locale,
  title = "Select date",
  placeholder = "Select date",
  className,
}: DatePickerSheetProps) {
  const today = new Date()
  const base = value ?? today
  const order = React.useMemo(() => {
    const parts = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(today)
    return parts
      .map((part) => part.type)
      .filter((type): type is "month" | "day" | "year" =>
        type === "month" || type === "day" || type === "year"
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  const monthName = React.useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { month: "long" })
    return (month: number) => format.format(new Date(2000, month - 1, 1))
  }, [locale])

  function spec(type: "month" | "day" | "year", draft: Record<string, string>): PickerColumnSpec {
    if (type === "month")
      return {
        id: "month",
        label: "Month",
        options: Array.from({ length: 12 }, (_, i) => ({
          value: String(i + 1),
          label: monthName(i + 1),
        })),
      }
    if (type === "year")
      return {
        id: "year",
        label: "Year",
        options: Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({
          value: String(minYear + i),
          label: String(minYear + i),
        })),
      }
    const count = daysIn(Number(draft.year), Number(draft.month))
    return {
      id: "day",
      label: "Day",
      options: Array.from({ length: count }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1),
      })),
    }
  }

  const toRecord = (draft: string[]) =>
    Object.fromEntries(order.map((type, i) => [type, draft[i] ?? ""])) as Record<string, string>

  return (
    <PickerSheet
      title={title}
      value={order.map((type) =>
        String(type === "month" ? base.getMonth() + 1 : type === "day" ? base.getDate() : base.getFullYear())
      )}
      columns={(draft) => order.map((type) => spec(type, toRecord(draft)))}
      normalize={(draft) => {
        const record = toRecord(draft)
        const max = daysIn(Number(record.year), Number(record.month))
        return order.map((type, i) =>
          type === "day" ? String(Math.min(Number(record.day), max)) : (draft[i] ?? "")
        )
      }}
      onValueChange={(draft) => {
        const record = toRecord(draft)
        onValueChange(new Date(Number(record.year), Number(record.month) - 1, Number(record.day)))
      }}
      trigger={
        <button
          type="button"
          className={[
            "border-input bg-background flex h-10 w-full items-center rounded-md border px-3 text-sm",
            value ? "" : "text-muted-foreground",
            className ?? "",
          ].join(" ")}
        >
          {value
            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value)
            : placeholder}
        </button>
      }
    />
  )
}

export {
  DatePickerSheet,
  PickerSheet,
  PickerWheel,
  type DatePickerSheetProps,
  type PickerOption,
  type PickerColumnSpec,
  type PickerSheetProps,
  type PickerWheelProps,
}
