// One error shape for everything the pipeline can surface to the browser.
// `fatal` errors stop a whole dive (bad key, no credits); others only fail one layer.
export class AppError extends Error {
  constructor(code, message, { fatal = false, source = "app" } = {}) {
    super(message);
    this.code = code;
    this.fatal = fatal;
    this.source = source;
  }
}

export const isAbort = (e, signal) =>
  signal?.aborted || e?.name === "AbortError" || e?.name === "APIUserAbortError" || e?.code === "cancelled";

export function publicError(e) {
  if (e instanceof AppError) return { code: e.code, message: e.message, source: e.source, fatal: e.fatal };
  return { code: "internal", message: "Something went wrong on the server. Check the server log.", source: "app", fatal: true };
}
