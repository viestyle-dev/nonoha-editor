// Built-in views: shipped with this package and listed by hosts as "builtin/<id>".

import type { DefinedView } from '../sdk'
import { levelMeterView } from './level-meter'
import { spectrogramView } from './spectrogram'

export { levelMeterView } from './level-meter'
export { spectrogramView } from './spectrogram'

export const builtinViews: readonly DefinedView[] = [spectrogramView, levelMeterView]
