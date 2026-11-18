// A canvas that fills a view's element at device resolution.

export interface Surface {
  readonly canvas: HTMLCanvasElement
  readonly g: CanvasRenderingContext2D
  /** Size in CSS px. */
  readonly width: number
  readonly height: number
  readonly dpr: number
  /** Set the CSS size; true when the backing store changed (contents are lost). */
  setSize(width: number, height: number): boolean
  /** Re-read devicePixelRatio (cheap; call at the start of a draw); true when it changed. */
  syncPixelRatio(): boolean
  /** Reset the transform so drawing uses CSS px. */
  begin(): void
  destroy(): void
}

const pixelRatio = () => (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1)

export function createSurface(element: HTMLElement, width: number, height: number): Surface {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  element.appendChild(canvas)
  const g = canvas.getContext('2d')
  if (!g) throw new Error('2D canvas is not available')
  const state = { width: 0, height: 0, dpr: pixelRatio() }

  const apply = (): boolean => {
    const w = Math.max(1, Math.round(state.width * state.dpr))
    const h = Math.max(1, Math.round(state.height * state.dpr))
    canvas.style.width = `${state.width}px`
    canvas.style.height = `${state.height}px`
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = w
    canvas.height = h
    return true
  }

  const surface: Surface = {
    canvas,
    g,
    get width() {
      return state.width
    },
    get height() {
      return state.height
    },
    get dpr() {
      return state.dpr
    },
    setSize(w, h) {
      state.width = Math.max(0, w)
      state.height = Math.max(0, h)
      return apply()
    },
    syncPixelRatio() {
      const dpr = pixelRatio()
      if (dpr === state.dpr) return false
      state.dpr = dpr
      apply()
      return true
    },
    begin() {
      g.setTransform(state.width > 0 ? canvas.width / state.width : 1, 0, 0, state.height > 0 ? canvas.height / state.height : 1, 0, 0)
    },
    destroy() {
      canvas.remove()
    },
  }
  surface.setSize(width, height)
  return surface
}

/** Font string for a theme font family. */
export function font(px: number, family: string, weight = 400): string {
  return `${weight} ${px}px ${family}`
}
