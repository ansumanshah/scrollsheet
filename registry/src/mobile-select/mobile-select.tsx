"use client"

import * as React from "react"
import { Sheet } from "scrollsheet"

interface MobileSelectOption {
  value: string
  label: string
  description?: string
  /** Extra words the search should match besides the label and description. */
  keywords?: readonly string[]
  /** Consecutive options with the same group render under one heading. */
  group?: string
  disabled?: boolean
}

interface MobileSelectProps
  extends Omit<
    React.ComponentProps<typeof Sheet.Trigger>,
    "value" | "defaultValue" | "onChange" | "children"
  > {
  options: readonly MobileSelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Shown in the trigger while nothing is selected. */
  placeholder?: string
  /** Heading of the sheet and the accessible name of the list. */
  title: string
  searchable?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  /**
   * Focus the search field on open, which raises the on-screen keyboard.
   * Defaults to true only for fine pointers, so a phone opens on the list.
   */
  autoFocusSearch?: boolean
  /** Replaces the built-in accent- and case-insensitive match. */
  filter?: (option: MobileSelectOption, query: string) => boolean
  /** Renders a hidden input so the value posts with a native form. */
  name?: string
}

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

function defaultFilter(option: MobileSelectOption, query: string) {
  const tokens = fold(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = fold(
    [option.label, option.description ?? "", ...(option.keywords ?? [])].join(" ")
  )
  return tokens.every((token) => haystack.includes(token))
}

function MobileSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  title,
  searchable = true,
  searchPlaceholder = "Search",
  emptyMessage = "No results",
  autoFocusSearch,
  filter = defaultFilter,
  name,
  className,
  ...triggerProps
}: MobileSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const selected = value === undefined ? uncontrolled : value
  const selectedOption = options.find((option) => option.value === selected)

  function commit(next: string) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <Sheet.Root
      open={open}
      onOpenChange={setOpen}
      detents={[0.7, "full"]}
      keyboardExpands
    >
      <Sheet.Trigger
        data-slot="mobile-select-trigger"
        className={[
          "border-input bg-background flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm",
          selectedOption ? "" : "text-muted-foreground",
          className ?? "",
        ].join(" ")}
        {...triggerProps}
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 opacity-50"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </Sheet.Trigger>
      {name ? <input type="hidden" name={name} value={selected ?? ""} /> : null}
      <Sheet.Content fill data-slot="mobile-select-content" className="bg-background rounded-t-xl">
        <MobileSelectPanel
          title={title}
          options={options}
          selected={selected}
          onSelect={commit}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          autoFocusSearch={autoFocusSearch}
          filter={filter}
        />
      </Sheet.Content>
    </Sheet.Root>
  )
}

interface PanelProps {
  title: string
  options: readonly MobileSelectOption[]
  selected: string | undefined
  onSelect: (value: string) => void
  searchable: boolean
  searchPlaceholder: string
  emptyMessage: string
  autoFocusSearch: boolean | undefined
  filter: (option: MobileSelectOption, query: string) => boolean
}

function MobileSelectPanel({
  title,
  options,
  selected,
  onSelect,
  searchable,
  searchPlaceholder,
  emptyMessage,
  autoFocusSearch,
  filter,
}: PanelProps) {
  const uid = React.useId()
  const listId = `${uid}-list`
  const optionId = (index: number) => `${uid}-option-${index}`

  const [query, setQuery] = React.useState("")
  const [pointed, setPointed] = React.useState<string | undefined>(selected)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const typeahead = React.useRef({ buffer: "", timer: 0 })

  const visible = React.useMemo(
    () => options.filter((option) => filter(option, query)),
    [options, filter, query]
  )
  const enabled = visible.filter((option) => !option.disabled)
  const active = enabled.find((option) => option.value === pointed) ?? enabled[0]
  const activeIndex = active ? visible.indexOf(active) : -1

  React.useEffect(() => {
    const wantsFocus =
      autoFocusSearch ?? !window.matchMedia("(pointer: coarse)").matches
    if (searchable && wantsFocus) inputRef.current?.focus()
  }, [autoFocusSearch, searchable])

  // Scrolls the list itself. scrollIntoView would also move ancestors,
  // including the sheet's own track.
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

  React.useEffect(() => () => window.clearTimeout(typeahead.current.timer), [])

  function move(delta: number | "first" | "last") {
    if (enabled.length === 0) return
    const current = active ? enabled.indexOf(active) : -1
    let next: number
    if (delta === "first") next = 0
    else if (delta === "last") next = enabled.length - 1
    else next = (current + delta + enabled.length) % enabled.length
    setPointed(enabled[next]?.value)
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
      case "Home":
        if (searchable) return
        move("first")
        break
      case "End":
        if (searchable) return
        move("last")
        break
      case "Enter":
        if (!active) return
        onSelect(active.value)
        break
      default: {
        // Without a search field the listbox itself matches typed prefixes.
        if (searchable || event.key.length !== 1 || event.ctrlKey || event.metaKey) return
        const state = typeahead.current
        window.clearTimeout(state.timer)
        state.buffer += event.key.toLowerCase()
        state.timer = window.setTimeout(() => (state.buffer = ""), 600)
        const hit = enabled.find((option) => fold(option.label).startsWith(state.buffer))
        if (hit) setPointed(hit.value)
        return
      }
    }
    event.preventDefault()
  }

  const comboboxProps = {
    "aria-controls": listId,
    "aria-activedescendant": activeIndex < 0 ? undefined : optionId(activeIndex),
    onKeyDown,
  }

  const sections: { group: string | undefined; items: { option: MobileSelectOption; index: number }[] }[] = []
  visible.forEach((option, index) => {
    const last = sections[sections.length - 1]
    if (last && last.group === option.group) last.items.push({ option, index })
    else sections.push({ group: option.group, items: [{ option, index }] })
  })

  return (
    <>
      <Sheet.Handle />
      <div data-slot="mobile-select-header" className="flex items-center justify-between px-4 pt-1 pb-2">
        <Sheet.Title className="text-base font-semibold">{title}</Sheet.Title>
        <Sheet.Close />
      </div>
      {searchable ? (
        <div data-slot="mobile-select-search" className="px-4 pb-2">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPointed(undefined)
            }}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            {...comboboxProps}
          />
        </div>
      ) : null}
      <div
        ref={listRef}
        id={listId}
        data-slot="mobile-select-list"
        role="listbox"
        aria-label={title}
        tabIndex={searchable ? undefined : 0}
        data-scrollsheet-nested-scroll
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingBottom: "var(--scrollsheet-safe-area, env(safe-area-inset-bottom))",
        }}
        className="px-2 outline-none"
        {...(searchable ? {} : comboboxProps)}
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
                data-slot="mobile-select-group"
                role="presentation"
                className="text-muted-foreground px-2 pt-3 pb-1 text-xs font-medium"
              >
                {section.group}
              </div>
            ) : null}
            {section.items.map(({ option, index }) => (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                data-slot="mobile-select-option"
                aria-selected={option.value === selected}
                aria-disabled={option.disabled || undefined}
                data-value={option.value}
                data-active={index === activeIndex ? "" : undefined}
                data-selected={option.value === selected ? "" : undefined}
                // Keeps focus (and the keyboard) in the search field.
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse" && !option.disabled) setPointed(option.value)
                }}
                onClick={() => {
                  if (!option.disabled) onSelect(option.value)
                }}
                className="data-[active]:bg-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.description ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {option.value === selected ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
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

export { MobileSelect, type MobileSelectOption, type MobileSelectProps }
