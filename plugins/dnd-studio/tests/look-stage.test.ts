import { test } from './limits'
import { checkPixelLook } from './pixel-look'

test('build look stage: pixel stage, light and dark, small', () => checkPixelLook('stage'))
