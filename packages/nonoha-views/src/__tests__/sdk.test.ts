import { describe, expect, it } from 'vitest'
import { inputAccepts, typeAccepts } from '../sdk'

describe('typeAccepts', () => {
  it('matches dtype and dims with ? wildcards', () => {
    expect(typeAccepts('u8[?x?x3]', 'u8[180x320x3]')).toBe(true)
    expect(typeAccepts('u8[?x?x3]', 'u8[180x320]')).toBe(false)
    expect(typeAccepts('u8[?x?]', 'u8[180x320]')).toBe(true)
    expect(typeAccepts('f32[?]', 'f64[?]')).toBe(false)
    expect(typeAccepts('f32[6x8]', 'f32[6x8]')).toBe(true)
    expect(typeAccepts('f32[6x8]', 'f32[?x?]')).toBe(false)
    expect(typeAccepts('f32', 'f32')).toBe(true)
  })

  it('supports any dtype, any rank and any type', () => {
    expect(typeAccepts('any[?]', 'i32[4]')).toBe(true)
    expect(typeAccepts('f32[*]', 'f32[2x3x4]')).toBe(true)
    expect(typeAccepts('any', 'str')).toBe(true)
    expect(inputAccepts({ name: 'x', accepts: ['f32[?]', 'f64[?]'] }, 'f64[512]')).toBe(true)
    expect(inputAccepts({ name: 'x', accepts: ['f32[?]'] }, 'f64[512]')).toBe(false)
  })
})
