import React, { useEffect } from "react";
import { ERROR_CATALOGUE, type UOAIErrorCode } from "@uoai/api-protocol";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm"
  };
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
  };

  return (
    <button
      type={type}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
};

export interface BadgeProps {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = "neutral", children, className = "" }) => {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    danger: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    info: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
};

export const Card: React.FC<{
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, actions, children, className = "" }) => (
  <section
    className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
  >
    {(title || actions) && (
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          {title && (
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          )}
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const ProgressBar: React.FC<{
  value: number;
  label: string;
  valueText?: string;
}> = ({ value, label, valueText }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>{label}</span>
        <span>{valueText ?? `${clamped}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={valueText ?? `${clamped}%`}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-200"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};

export const ErrorAlert: React.FC<{
  code: UOAIErrorCode | string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ code, message, onRetry, actionLabel, onAction }) => {
  const meta =
    code in ERROR_CATALOGUE
      ? ERROR_CATALOGUE[code as UOAIErrorCode]
      : ERROR_CATALOGUE.internal_error;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {meta.userTitle}{" "}
            <span className="ml-1 font-mono text-xs font-normal opacity-75">({code})</span>
          </p>
          <p className="mt-1 text-xs">{message ?? meta.defaultMessage}</p>
          <p className="mt-1 text-xs opacity-85">{meta.userGuidance}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          )}
          {onAction && actionLabel && (
            <Button size="sm" variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ModalDialog: React.FC<{
  open: boolean;
  title: string;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, role = "dialog", onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div
        role={role}
        aria-modal="true"
        aria-labelledby="uoai-modal-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="uoai-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <Button size="sm" variant="ghost" aria-label="Close dialog" onClick={onClose}>
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
};

/**
 * Strictly sanitized Markdown renderer (FR-030, T-10).
 * Never uses dangerouslySetInnerHTML, never executes <script>, never loads remote <img> beacons.
 */
export const SafeMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const inner = block.slice(3, -3).replace(/^[a-zA-Z0-9_-]*\n/, "");
          return (
            <pre
              key={idx}
              className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        return (
          <div key={idx} className="space-y-1">
            {block.split("\n").map((line, lIdx) => {
              if (line.startsWith("### ")) {
                return (
                  <h4 key={lIdx} className="font-semibold text-slate-900 dark:text-slate-100">
                    {line.slice(4)}
                  </h4>
                );
              }
              if (line.startsWith("## ")) {
                return (
                  <h3 key={lIdx} className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {line.slice(3)}
                  </h3>
                );
              }
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return (
                  <div key={lIdx} className="flex gap-2 pl-2">
                    <span>•</span>
                    <span>{renderInlineFormatting(line.slice(2))}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-slate-200/80 px-1 py-0.5 font-mono text-xs dark:bg-slate-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
