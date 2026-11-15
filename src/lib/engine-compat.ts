/**
 * Which engine versions this editor is built for. Features are switched by
 * the engine's capabilities, not by version; the range only decides whether
 * to warn (operations are never blocked).
 */
export const SUPPORTED_ENGINE = { min: "1.0.0", below: "2.0.0" } as const

export type EngineCompatStatus =
  /** Capabilities not loaded yet. */
  | "loading"
  /** Version in the supported range. */
  | "ok"
  /** Engine without the capabilities endpoint: a 1.0 release, exact version unknown. */
  | "legacy"
  | "too_old"
  | "too_new"
  /** Not reachable. */
  | "unreachable"

function parse(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * @param version engine version from capabilities; undefined while loading
 * @param capabilities "loading" | "none" (endpoint missing) | "error" | "ok"
 */
export function engineCompatStatus(
  version: string | undefined,
  capabilities: "loading" | "none" | "error" | "ok",
): EngineCompatStatus {
  if (capabilities === "loading") return "loading"
  if (capabilities === "error") return "unreachable"
  if (capabilities === "none") return "legacy"
  const parsed = version ? parse(version) : null
  if (!parsed) return "legacy"
  if (compare(parsed, parse(SUPPORTED_ENGINE.min)!) < 0) return "too_old"
  if (compare(parsed, parse(SUPPORTED_ENGINE.below)!) >= 0) return "too_new"
  return "ok"
}

export function isCompatWarning(status: EngineCompatStatus): boolean {
  return status === "too_old" || status === "too_new"
}

export function describeCompat(status: EngineCompatStatus, version: string | undefined): string {
  const range = `${SUPPORTED_ENGINE.min} – <${SUPPORTED_ENGINE.below}`
  switch (status) {
    case "ok":
      return `Compatible (supported: ${range})`
    case "legacy":
      return "Engine 1.0 (no capabilities endpoint). Editing works; port activity, peek and plugin views need engine 1.1 or later."
    case "too_old":
      return `Engine ${version} is older than this editor supports (${range}). Some features may not work.`
    case "too_new":
      return `Engine ${version} is newer than this editor supports (${range}). Update the editor; some features may not work.`
    case "unreachable":
      return "The engine could not be reached."
    default:
      return "Connecting…"
  }
}
