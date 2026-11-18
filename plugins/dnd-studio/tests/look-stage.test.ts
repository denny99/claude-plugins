import { test } from 'claude-code/testing'
import { checkPixelLook } from './pixel-look'

test('build look stage: pixel stage, light and dark, small', () => checkPixelLook('stage'))
