'use client';

// components/TaskConsole.tsx — the "judges drive it" input (Lane B).
// A single serif prompt field + RUN + one-click example chips. On submit it
// hands the task up to the page, which starts the SSE run via useJobStream.

import { useState } from 'react';
import { clsx } from 'clsx';
import { Hairline } from './Hairline';

interface TaskConsoleProps {
  onRun: (task: string) => void;
  isRunning: boolean;
  exampleTasks: string[];
  disabled?: boolean;
}

export function TaskConsole({ onRun, isRunning, exampleTasks, disabled }: TaskConsoleProps) {
  const [value, setValue] = useState('');

  const submit = (task: string) => {
    const t = task.trim();
    if (!t || disabled) return;
    onRun(t);
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex flex-col gap-0"
      >
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="task-input" className="label mb-2 block">
              Give the market a task
            </label>
            <input
              id="task-input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. Give me a pre-market briefing on NVDA and the semiconductor tape."
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              className={clsx(
                'w-full border-0 border-b border-hairline-hi bg-transparent pb-3',
                'font-serif text-2xl leading-tight tracking-display text-ink',
                'placeholder:text-ink-400 focus:border-ink focus:outline-none',
                'transition-colors duration-300 ease-vellum disabled:opacity-50',
              )}
            />
          </div>

          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className={clsx(
              'label shrink-0 border border-ink px-6 py-3 text-ink transition-colors duration-300 ease-vellum',
              'hover:bg-ink hover:text-canvas disabled:cursor-not-allowed disabled:border-hairline disabled:text-ink-400 disabled:hover:bg-transparent',
            )}
          >
            {isRunning ? (
              <span className="inline-flex items-center gap-2">
                RUNNING <span className="ink-cursor" style={{ background: 'currentColor' }} />
              </span>
            ) : (
              'RUN'
            )}
          </button>
        </div>
      </form>

      {exampleTasks.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="label mr-1 text-ink-400">Try</span>
          {exampleTasks.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={disabled}
              onClick={() => {
                setValue(ex);
                submit(ex);
              }}
              className={clsx(
                'group inline-flex max-w-full items-center border border-hairline px-3 py-1.5 text-left',
                'font-serif text-[15px] italic text-body transition-colors duration-300 ease-vellum',
                'hover:border-ink hover:text-ink disabled:opacity-50 disabled:hover:border-hairline',
              )}
              title={ex}
            >
              <span className="truncate">{ex}</span>
            </button>
          ))}
        </div>
      )}
      <Hairline className="mt-6" />
    </div>
  );
}
