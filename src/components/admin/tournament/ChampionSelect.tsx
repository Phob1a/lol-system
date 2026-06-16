'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getChampions, championIconUrl, championName } from '@/lib/tournament/champions';

type Props = {
  value: string | null;
  onChange: (key: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function ChampionSelect({ value, onChange, placeholder = '选择英雄', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const listboxId = useId();
  const champions = getChampions();

  const filtered = query.trim()
    ? champions.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.key.toLowerCase().includes(query.toLowerCase()),
      )
    : champions;

  const currentName = value ? (championName(value) ?? value) : null;

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setImgError(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(key: string) {
    onChange(key);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setImgError(false);
  }

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClickOutside]);

  // reset img error when value changes
  useEffect(() => {
    setImgError(false);
  }, [value]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={handleOpen}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm transition-colors',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {value ? (
            <>
              {!imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={championIconUrl(value)}
                  alt={currentName ?? value}
                  width={20}
                  height={20}
                  className="h-5 w-5 shrink-0 rounded-sm object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-sm bg-muted" aria-hidden="true" />
              )}
              <span className="truncate">{currentName ?? value}</span>
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {value && !disabled && (
            <span
              role="button"
              aria-label="清除"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent);
              }}
              className="rounded p-0.5 hover:bg-accent"
            >
              <X className="h-3 w-3 opacity-60" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-[70] mt-1 w-full min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索英雄…"
              className="h-8 text-sm"
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-label="英雄列表"
            className="max-h-64 overflow-auto px-1 pb-1"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">无结果</li>
            ) : (
              filtered.map((c) => (
                <ChampionOption
                  key={c.key}
                  championKey={c.key}
                  name={c.name}
                  selected={c.key === value}
                  onSelect={handleSelect}
                />
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

type OptionProps = {
  championKey: string;
  name: string;
  selected: boolean;
  onSelect: (key: string) => void;
};

function ChampionOption({ championKey, name, selected, onSelect }: OptionProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <li
      role="option"
      aria-selected={selected}
      data-champion-key={championKey}
      onClick={() => onSelect(championKey)}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
        'hover:bg-accent hover:text-accent-foreground',
        selected && 'bg-accent/50 font-medium',
      )}
    >
      {!imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={championIconUrl(championKey)}
          alt={name}
          width={20}
          height={20}
          className="h-5 w-5 shrink-0 rounded-sm object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-sm bg-muted text-center text-[9px] leading-5">
          {championKey[0]}
        </span>
      )}
      <span className="flex-1 truncate">{name}</span>
      <span className="text-xs text-muted-foreground">{championKey}</span>
    </li>
  );
}
