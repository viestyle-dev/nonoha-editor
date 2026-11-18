import type { Float32PortValue, PortValue } from 'nonoha-client-js'

/** f32 scalar value (dataType 9 = Float32), without importing client-js at run time. */
export const f32 = (n: number): PortValue => ({ dataType: 9 as Float32PortValue['dataType'], shape: [1], array: new Float32Array([n]) })

export const fakeElement = (width = 10, height = 10) =>
  ({ getBoundingClientRect: () => ({ width, height }) }) as unknown as HTMLElement
