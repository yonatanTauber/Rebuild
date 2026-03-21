"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type UiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type UiSelectProps = {
  value: string;
  options: UiSelectOption[];
  onChange: (value: string) => void;
  onCreate?: (query: string) => void;
  creatable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  menuClassName?: string;
  searchable?: boolean;
  maxVisibleOptions?: number;
  noResultsLabel?: string;
};

export default function UiSelect({
  value,
  options,
  onChange,
  onCreate,
  creatable = false,
  placeholder = "בחר",
  disabled = false,
  autoFocus = false,
  className,
  menuClassName,
  searchable = false,
  maxVisibleOptions = 18,
  noResultsLabel = "אין תוצאות"
}: UiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuUpwards, setMenuUpwards] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(260);
  const [menuViewportPos, setMenuViewportPos] = useState<{ top: number; left: number; right: number; width: number; rtl: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    return selected?.label ?? "";
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const scoped = searchable && normalizedQuery
      ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
      : options;
    return scoped.slice(0, Math.max(1, maxVisibleOptions));
  }, [maxVisibleOptions, options, query, searchable]);

  const trimmedQuery = query.trim();
  const canCreate = Boolean(creatable && searchable && onCreate && trimmedQuery.length >= 2);

  const firstEnabledOption = useMemo(
    () => filteredOptions.find((option) => !option.disabled) ?? null,
    [filteredOptions]
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedLabel);
    }
  }, [open, selectedLabel]);

  useEffect(() => {
    if (!open && !selectedLabel) {
      setQuery("");
    }
  }, [open, selectedLabel]);

  useEffect(() => {
    if (!open) {
      setMenuUpwards(false);
      return;
    }

    function updatePlacement() {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const estimatedMenuHeight = Math.min(260, Math.max(120, filteredOptions.length * 34 + 16));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
      const isRtl = getComputedStyle(rootRef.current).direction === "rtl";

      setMenuUpwards(shouldOpenUp);
      const availableSpace = Math.max(120, Math.floor((shouldOpenUp ? spaceAbove : spaceBelow) - 12));
      setMenuMaxHeight(Math.min(estimatedMenuHeight, availableSpace));
      setMenuViewportPos({
        top: shouldOpenUp ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        right: window.innerWidth - rect.right,
        rtl: isRtl,
        width: rect.width
      });
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, filteredOptions.length]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
        setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={["ui-select", open ? "open" : "", disabled ? "disabled" : "", className ?? ""].join(" ").trim()}>
      {searchable ? (
        <div className="ui-select-trigger ui-select-trigger-search" aria-haspopup="listbox" aria-expanded={open}>
          <input
            className="ui-select-input"
            value={query}
            onFocus={() => {
              if (!disabled) setOpen(true);
            }}
            onChange={(event) => {
              if (disabled) return;
              setQuery(event.target.value);
              if (!open) setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                setQuery(selectedLabel);
                return;
              }
              if (event.key === "Enter" && firstEnabledOption) {
                event.preventDefault();
                onChange(firstEnabledOption.value);
                setQuery(firstEnabledOption.label);
                setOpen(false);
                return;
              }
              if (event.key === "Enter" && canCreate && filteredOptions.length === 0) {
                event.preventDefault();
                onCreate?.(trimmedQuery);
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
          />
          <button
            type="button"
            className="ui-select-caret-btn"
            onClick={() => {
              if (disabled) return;
              setOpen((prev) => !prev);
            }}
            disabled={disabled}
            aria-label="פתח רשימה"
          >
            <span className="ui-select-caret" aria-hidden>
              ▾
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ui-select-trigger"
          onClick={() => {
            if (disabled) return;
            setOpen((prev) => !prev);
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
        >
          <span className={selectedLabel ? "" : "ui-select-placeholder"}>{selectedLabel || placeholder}</span>
          <span className="ui-select-caret" aria-hidden>
            ▾
          </span>
        </button>
      )}

      {open && menuViewportPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className={["ui-select-menu", "portal", menuUpwards ? "upwards" : "", menuClassName ?? ""].join(" ").trim()}
              role="listbox"
              style={{
                maxHeight: `${menuMaxHeight}px`,
                top: `${menuViewportPos.top}px`,
                left: menuViewportPos.rtl ? "auto" : `${menuViewportPos.left}px`,
                right: menuViewportPos.rtl ? `${menuViewportPos.right}px` : "auto",
                width: `${menuViewportPos.width}px`,
                transform: menuUpwards ? "translateY(-100%)" : "none"
              }}
            >
              {filteredOptions.length === 0 ? (
                canCreate ? (
                  <button
                    type="button"
                    className="ui-select-create"
                    onClick={() => {
                      onCreate?.(trimmedQuery);
                      setOpen(false);
                    }}
                  >
                    ＋ הוסף "{trimmedQuery}"
                  </button>
                ) : (
                  <div className="ui-select-empty">{noResultsLabel}</div>
                )
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={["ui-select-option", option.value === value ? "selected" : ""].join(" ").trim()}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setQuery(option.label);
                      setOpen(false);
                    }}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
