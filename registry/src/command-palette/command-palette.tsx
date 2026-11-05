"use client"

import * as React from "react"
import { Sheet } from "scrollsheet"

interface CommandItem {
  id: string
  label: string
  /** Consecutive items with the same group render under one heading. */
  group?: string
  /** Display-only hint, for example "⌘N". Binding the key is up to you. */
  shortcut?: string
  /** Extra words the search should match. */
  keywords?: readonly string[]
  disabled?: boolean
  onSelect: () => void
}

interface CommandPaletteProps {
  items: readonly CommandItem[]
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Rendered through Sheet.Trigger asChild. Omit it to open with the hotkey only. */
  trigger?: React.ReactElement
  /** Toggles with Cmd/Ctrl plus this key. Pass false to turn the hotkey off. */
  hotkey?: string | false
  title?: string
  placeholder?: string
  emptyMessage?: string
}

// Matches the sheet's default desktopBreakpoint.
const DESKTOP_QUERY = "(min-width: 768px)"

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** 0 means no match. Prefix beats word start beats substring. */
function score(item: CommandItem, query: string) {
  const tokens = fold(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1
  const label = fold(item.label)
  const haystack = `${label} ${fold((item.keywords ?? []).join(" "))}`
  let total = 0
  for (const token of tokens) {
    if (!haystack.includes(token)) return 0
    if (label.startsWith(token)) total += 3
    else if (label.includes(` ${token}`)) total += 2
    else total += 1
  }
  return total
}

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function CommandPalette({
  items,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  trigger,
  hotkey = "k",
  title = "Command menu",
  placeholder = "Type a command or search…",
  emptyMessage = "No results",
}: CommandPaletteProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  React.useEffect(() => {
    if (!hotkey) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || !(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== hotkey) return
      event.preventDefault()
      setOpen(!open)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [hotkey, open, setOpen])

  return (
    <Sheet.Root
      open={open}
      onOpenChange={setOpen}
      desktopSide="center"
      detents={[0.7, "full"]}
      keyboardExpands
    >
      {trigger ? <Sheet.Trigger asChild>{trigger}</Sheet.Trigger> : null}
      <Sheet.Content
        fill
        data-slot="command-palette-content"
        className="bg-background rounded-t-xl md:rounded-xl"
        style={{ width: "min(560px, 100%)" }}
      >
        <CommandPanel
          title={title}
          items={items}
          placeholder={placeholder}
          emptyMessage={emptyMessage}
          close={() => setOpen(false)}
        />
      </Sheet.Content>
    </Sheet.Root>
  )
}

interface PanelProps {
  title: string
  items: readonly CommandItem[]
  placeholder: string
  emptyMessage: string
  close: () => void
}

function CommandPanel({ title, items, placeholder, emptyMessage, close }: PanelProps) {
  const uid = React.useId()
  const listId = `${uid}-list`
  const optionId = (index: number) => `${uid}-option-${index}`
  const desktop = React.useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  )

  const [query, setQuery] = React.useState("")
  const [pointed, setPointed] = React.useState<string | undefined>()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const visible = React.useMemo(() => {
    const groupOrder = new Map<string | undefined, number>()
    items.forEach((item) => {
      if (!groupOrder.has(item.group)) groupOrder.set(item.group, groupOrder.size)
    })
    return items
      .map((item, index) => ({ item, index, rank: score(item, query) }))
      .filter((entry) => entry.rank > 0)
      .sort(
        (a, b) =>
          (groupOrder.get(a.item.group) ?? 0) - (groupOrder.get(b.item.group) ?? 0) ||
          b.rank - a.rank ||
          a.index - b.index
      )
      .map((entry) => entry.item)
  }, [items, query])
  const enabled = visible.filter((item) => !item.disabled)
  const active = enabled.find((item) => item.id === pointed) ?? enabled[0]
  const activeIndex = active ? visible.indexOf(active) : -1

  React.useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus()
  }, [])

  // Scrolls the list itself. scrollIntoView would also move the sheet's track.
  React.useEffect(() => {
    const list = listRef.current
    const node = activeIndex < 0 ? null : document.getElementById(optionId(activeIndex))
    if (!list || !node) return
    const listBox = list.getBoundingClientRect()
    const nodeBox = node.getBoundingClientRect()
    if (nodeBox.top < listBox.top) list.scrollTop += nodeBox.top - listBox.top
    else if (nodeBox.bottom > listBox.bottom) list.scrollTop += nodeBox.bottom - listBox.bottom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, uid])

  function run(item: CommandItem) {
    if (item.disabled) return
    close()
    item.onSelect()
  }

  function move(delta: number | "first" | "last") {
    if (enabled.length === 0) return
    const current = active ? enabled.indexOf(active) : -1
    let next: number
    if (delta === "first") next = 0
    else if (delta === "last") next = enabled.length - 1
    else next = (current + delta + enabled.length) % enabled.length
    setPointed(enabled[next]?.id)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case "ArrowDown":
        move(1)
        break
      case "ArrowUp":
        move(-1)
        break
      case "PageDown":
        move(enabled.length > 8 ? 8 : "last")
        break
      case "PageUp":
        move(enabled.length > 8 ? -8 : "first")
        break
      case "Enter":
        if (!active) return
        run(active)
        break
      default:
        return
    }
    event.preventDefault()
  }

  const sections: { group: string | undefined; entries: { item: CommandItem; index: number }[] }[] = []
  visible.forEach((item, index) => {
    const last = sections[sections.length - 1]
    if (last && last.group === item.group) last.entries.push({ item, index })
    else sections.push({ group: item.group, entries: [{ item, index }] })
  })

  return (
    <>
      <Sheet.Handle />
      <Sheet.Title style={VISUALLY_HIDDEN}>{title}</Sheet.Title>
      <div data-slot="command-palette-search" className="border-b px-4 py-2">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-label={title}
          aria-controls={listId}
          aria-activedescendant={activeIndex < 0 ? undefined : optionId(activeIndex)}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPointed(undefined)
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full bg-transparent text-base outline-none"
        />
      </div>
      <div
        ref={listRef}
        id={listId}
        data-slot="command-palette-list"
        role="listbox"
        aria-label={title}
        data-scrollsheet-nested-scroll
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          maxHeight: desktop ? "min(24rem, 60dvh)" : undefined,
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingBottom: "var(--scrollsheet-safe-area, env(safe-area-inset-bottom))",
        }}
        className="p-2"
      >
        {sections.map((section, sectionIndex) => (
          <div
            key={section.group ?? `section-${sectionIndex}`}
            role={section.group ? "group" : "presentation"}
            aria-labelledby={section.group ? `${uid}-group-${sectionIndex}` : undefined}
          >
            {section.group ? (
              <div
                id={`${uid}-group-${sectionIndex}`}
                role="presentation"
                data-slot="command-palette-group"
                className="text-muted-foreground px-2 pt-3 pb-1 text-xs font-medium"
              >
                {section.group}
              </div>
            ) : null}
            {section.entries.map(({ item, index }) => (
              <div
                key={item.id}
                id={optionId(index)}
                role="option"
                data-slot="command-palette-item"
                aria-selected={index === activeIndex}
                aria-disabled={item.disabled || undefined}
                data-active={index === activeIndex ? "" : undefined}
                // Keeps focus (and the keyboard) in the search field.
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse" && !item.disabled) setPointed(item.id)
                }}
                onClick={() => run(item)}
                className="data-[active]:bg-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut ? (
                  <kbd className="text-muted-foreground font-sans text-xs">{item.shortcut}</kbd>
                ) : null}
              </div>
            ))}
          </div>
        ))}
        {visible.length === 0 ? (
          <p role="status" className="text-muted-foreground px-2 py-6 text-center text-sm">
            {emptyMessage}
          </p>
        ) : null}
      </div>
      <div role="status" aria-live="polite" style={VISUALLY_HIDDEN}>
        {query && visible.length > 0
          ? `${visible.length} ${visible.length === 1 ? "result" : "results"}`
          : ""}
      </div>
    </>
  )
}

export { CommandPalette, type CommandItem, type CommandPaletteProps }
