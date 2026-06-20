/**
 * Field — NEXUS themed input / textarea wrapper.
 *
 * Renders an <input> by default; use multiline for <textarea>.
 * The outer wrapper handles layout; inner element carries the NEXUS token styles.
 *
 * COMMAND  — 2px radius, brighter focus ring + outer glow (nexus.css .nexus-field)
 * CELESTIAL — 4px radius, standard accent focus ring
 *
 * Usage:
 *   <Field placeholder="Search players…" />
 *   <Field multiline rows={4} placeholder="Notes…" />
 *   <Field label="Summoner Name" placeholder="e.g. Hide on bush" />
 */

import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/* Union of input + textarea attrs — we pick whichever element is rendered */
type InputOrTextareaProps = InputHTMLAttributes<HTMLInputElement> &
  TextareaHTMLAttributes<HTMLTextAreaElement>;

export interface FieldProps extends Omit<InputOrTextareaProps, 'ref'> {
  /** When true, renders a <textarea> instead of <input>. */
  multiline?: boolean;
  /** Optional label rendered above the field. */
  label?: ReactNode;
  /** Wrapper <div> className (separate from the inner input className). */
  wrapperClassName?: string;
}

const sharedFieldClasses = [
  'w-full',
  'font-mono text-[12.5px] text-nexus-ink',
  'bg-nexus-bg border border-nexus-line',
  'px-3 py-[10px]',
  'rounded-[var(--radius-nexus)]',
  'outline-none resize-none',
  'placeholder:text-nexus-faint',
  'transition-[border-color,box-shadow] duration-150',
  // base focus (celestial + fallback)
  'focus:border-nexus-accent',
  'focus:shadow-[0_0_0_3px_rgb(var(--accent-n)_/_0.14)]',
  // nexus.css overrides the focus shadow on command with a brighter ring
  'nexus-field',
].join(' ');

const Field = forwardRef<
  HTMLInputElement & HTMLTextAreaElement,
  FieldProps
>(
  (
    {
      multiline = false,
      label,
      wrapperClassName,
      className,
      ...rest
    },
    ref
  ) => {
    const inputEl = multiline ? (
      <textarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        className={cn(sharedFieldClasses, className)}
        {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    ) : (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        className={cn(sharedFieldClasses, className)}
        {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      />
    );

    if (label == null) return inputEl;

    return (
      <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
          {label}
        </label>
        {inputEl}
      </div>
    );
  }
);

Field.displayName = 'Field';
export default Field;
