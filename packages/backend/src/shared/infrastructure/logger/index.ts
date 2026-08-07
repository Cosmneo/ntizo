// Minimal logger — stubbed from flowzao's ConsoleLoggerAdapter.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export class ConsoleLoggerAdapter implements Logger {
  constructor(private readonly level: LogLevel = "info") {}

  private shouldLog(level: LogLevel): boolean {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    return order.indexOf(level) >= order.indexOf(this.level);
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    if (this.shouldLog("debug")) console.debug(msg, meta ?? "");
  }
  info(msg: string, meta?: Record<string, unknown>) {
    if (this.shouldLog("info")) console.info(msg, meta ?? "");
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    if (this.shouldLog("warn")) console.warn(msg, meta ?? "");
  }
  error(msg: string, meta?: Record<string, unknown>) {
    if (this.shouldLog("error")) console.error(msg, meta ?? "");
  }
}

let _requestLogger: Logger | undefined;

export function setRequestScopedLogger(logger: Logger) {
  _requestLogger = logger;
}

export function getRequestScopedLogger(): Logger {
  if (!_requestLogger) throw new Error("No request-scoped logger set");
  return _requestLogger;
}
