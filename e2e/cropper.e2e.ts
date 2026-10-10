import { expect, test, type Locator, type Page } from '@playwright/test'
import type { CropArea, OnCropCompleteEvent } from '#lib'

type TouchPoint = {
  identifier: number
  clientX: number
  clientY: number
}

type TouchEventName = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'
type SafariGestureEventName = 'gesturestart' | 'gesturechange' | 'gestureend'

type CropPayload = OnCropCompleteEvent
type ImageMatrix = { a: number; b: number; c: number; d: number; e: number; f: number }

test.describe.configure({ mode: 'parallel' })

async function openCropper(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('cropper')).toBeVisible()
}

async function dragImage(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(0, 0)
  await page.mouse.down()
  await page.mouse.move(x, y)
  await page.mouse.up()
}

// Playwright's touchscreen only emulates taps, so drags and pinches are
// dispatched the way the "Touch events (legacy)" guide documents:
// locator.dispatchEvent with touch lists (no `new Touch()` needed, the
// browser builds Touch objects from the init dicts).
async function sendTouchEvent(
  container: Locator,
  type: TouchEventName,
  points: TouchPoint[],
  changedPoints: TouchPoint[] = points,
): Promise<void> {
  await container.dispatchEvent(type, {
    touches: points,
    changedTouches: changedPoints,
    targetTouches: points,
  })
}

function touchPair(centerX: number, centerY: number, angle: number, distance = 100): [TouchPoint, TouchPoint] {
  const angleInRadians = (angle * Math.PI) / 180
  const offsetX = (Math.cos(angleInRadians) * distance) / 2
  const offsetY = (Math.sin(angleInRadians) * distance) / 2
  return [
    { identifier: 0, clientX: centerX - offsetX, clientY: centerY - offsetY },
    { identifier: 1, clientX: centerX + offsetX, clientY: centerY + offsetY },
  ]
}

async function touchPairAtCenter(page: Page, angle: number, distance = 100): Promise<[TouchPoint, TouchPoint]> {
  const box = await page.getByTestId('container').boundingBox()
  if (!box) throw new Error('Cropper container has no bounding box')
  return touchPair(box.x + box.width / 2, box.y + box.height / 2, angle, distance)
}

async function dispatchSafariGesture(
  page: Page,
  type: SafariGestureEventName,
  scale: number,
  rotation: number,
): Promise<boolean> {
  return page.getByTestId('container').evaluate(
    (element, init) => {
      const event = new Event(init.type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        scale: { value: init.scale },
        rotation: { value: init.rotation },
      })
      return !element.dispatchEvent(event)
    },
    { type, scale, rotation },
  )
}

async function readImageMatrix(page: Page): Promise<ImageMatrix> {
  return page.getByTestId('image').evaluate(element => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform)
    return {
      a: transform.a,
      b: transform.b,
      c: transform.c,
      d: transform.d,
      e: transform.e,
      f: transform.f,
    }
  })
}

function isCropArea(value: unknown): value is CropArea {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    typeof value.x === 'number' &&
    'y' in value &&
    typeof value.y === 'number' &&
    'width' in value &&
    typeof value.width === 'number' &&
    'height' in value &&
    typeof value.height === 'number'
  )
}

function isCropPayload(value: unknown): value is CropPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'percent' in value &&
    isCropArea(value.percent) &&
    'pixels' in value &&
    isCropArea(value.pixels)
  )
}

function parseCropPayload(raw: string | null): CropPayload {
  if (raw === null) throw new Error('Crop output is missing')
  const parsed: unknown = JSON.parse(raw)
  if (!isCropPayload(parsed)) throw new Error('Crop output has an unexpected shape')
  return parsed
}

async function readCropPayload(page: Page, testId = 'crop-data'): Promise<CropPayload> {
  const output = page.getByTestId(testId)
  await expect(output).toBeVisible()
  return parseCropPayload(await output.textContent())
}

function expectAreaToMatch(actual: CropArea, expected: CropArea, precision = 1): void {
  expect(actual.x).toBeCloseTo(expected.x, precision)
  expect(actual.y).toBeCloseTo(expected.y, precision)
  expect(actual.width).toBeCloseTo(expected.width, precision)
  expect(actual.height).toBeCloseTo(expected.height, precision)
}

function areaQuery(area: CropArea): string {
  return [area.x, area.y, area.width, area.height].join(',')
}

async function pinch(page: Page, distance: number): Promise<void> {
  const container = page.getByTestId('container')
  await sendTouchEvent(container, 'touchstart', [
    { identifier: 0, clientX: 0, clientY: 0 },
    { identifier: 1, clientX: 0, clientY: 10 },
  ])
  await sendTouchEvent(container, 'touchmove', [
    { identifier: 0, clientX: 0, clientY: 0 },
    { identifier: 1, clientX: 0, clientY: 10 + distance },
  ])
  await sendTouchEvent(container, 'touchend', [])
}

// Exact computed-CSS pixel strings are brittle for content-sized images: the
// same layout reports 1279.98px instead of 1280px depending on subpixel
// rounding. Polling the bounding box with a ±0.5px tolerance stays sensitive
// to real regressions (a broken fit is off by hundreds of px) without that
// flake. NaN keeps polling while the box is missing (e.g. mid-navigation).
async function expectBox(locator: Locator, width: number, height: number): Promise<void> {
  await expect
    .poll(async () => (await locator.boundingBox())?.width ?? Number.NaN)
    .toBeCloseTo(width, 0)
  await expect
    .poll(async () => (await locator.boundingBox())?.height ?? Number.NaN)
    .toBeCloseTo(height, 0)
}

test.describe('cropper sizing', () => {
  test.beforeEach(async ({ page }) => openCropper(page))

  test('fits a landscape image and crop area to the viewport', async ({ page }) => {
    // dog.jpeg is 1910x1000 in a 1280x720 viewport, so it is width-constrained.
    await expectBox(page.getByTestId('image'), 1280, 670)
    await expectBox(page.getByTestId('cropper'), 893, 670)
  })

  test('fits a portrait image to the viewport', async ({ page }) => {
    // cat.jpeg is 361x640: renders at natural size, crop height is aspect-driven.
    await page.goto('/?img=/images/cat.jpeg')
    await expectBox(page.getByTestId('image'), 361, 640)
    await expectBox(page.getByTestId('cropper'), 361, 271)
  })

  test('recomputes image and crop dimensions after a viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 1000 })
    await expectBox(page.getByTestId('image'), 600, 314)
    await expectBox(page.getByTestId('cropper'), 419, 314)
  })
})

test.describe('crop events', () => {
  test.beforeEach(async ({ page }) => openCropper(page))

  test('emits crop data once the image loads', async ({ page }) => {
    await expect(page.getByTestId('crop-data')).toContainText('percent')
    await expect(page.getByTestId('crop-data')).toContainText('pixels')
  })

  test('updates crop area data during interaction', async ({ page }) => {
    const liveCropData = page.getByTestId('live-crop-data')
    await expect(liveCropData).toContainText('percent')
    const initialCrop = await liveCropData.textContent()

    await dragImage(page, 50, 0)
    await expect.poll(() => liveCropData.textContent()).not.toBe(initialCrop)
  })
})

test('loads and crops a video source', async ({ page }) => {
  await page.goto('/?video=/videos/sample.webm')
  const video = page.getByTestId('video')
  await expect(video).toBeVisible()
  await expect
    .poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0)
  await expect(page.getByTestId('crop-data')).toContainText('pixels')
})

test('rotates the media and fits the crop area to rotated bounds', async ({ page }) => {
  await page.goto('/?rotation=90')
  const image = page.getByTestId('image')
  await expect(image).toBeVisible()
  await expectBox(page.getByTestId('cropper'), 670, 502.5)

  const matrix = await image.evaluate(element => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform)
    return { a: transform.a, b: transform.b, c: transform.c, d: transform.d }
  })
  expect(matrix.a).toBeCloseTo(0)
  expect(matrix.b).toBeCloseTo(1)
  expect(matrix.c).toBeCloseTo(-1)
  expect(matrix.d).toBeCloseTo(0)
})

test('keeps the pointer anchored when zooming rotated media', async ({ page }) => {
  await page.goto('/?rotation=90')
  await expect(page.getByTestId('cropper')).toBeVisible()
  const image = page.getByTestId('image')
  await page.mouse.move(600, 380)
  await page.mouse.wheel(0, -100)

  await expect
    .poll(() =>
      image.evaluate(element => {
        const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform)
        return {
          b: Number(transform.b.toFixed(3)),
          e: Number(transform.e.toFixed(3)),
          f: Number(transform.f.toFixed(3)),
        }
      }),
    )
    .toEqual({ b: 1.5, e: 20, f: -10 })
})

test.describe('mouse interactions', () => {
  test.beforeEach(async ({ page }) => openCropper(page))

  test('moves the image when dragged', async ({ page }) => {
    await dragImage(page, 50, 0)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 50, 0)')
  })

  test('limits dragging at the edges', async ({ page }) => {
    // max horizontal offset is |1280 / 2 - 893.33 / 2| = 193.333, vertical is locked.
    await dragImage(page, -1000, 0)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -193.333, 0)')

    await dragImage(page, 1000, 0)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 193.333, 0)')
  })

  test('zooms with the mouse wheel', async ({ page }) => {
    await page.mouse.move(640, 360)
    await page.mouse.wheel(0, -100)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 0, 0)')

    await page.mouse.wheel(0, 50)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.25, 0, 0, 1.25, 0, 0)')
  })

  test('zooms around the pointer', async ({ page }) => {
    await page.mouse.move(0, 0)
    await page.mouse.wheel(0, -100)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 320, 167.5)')

    await page.mouse.move(800, 400)
    await page.mouse.wheel(0, 50)
    await expect(page.getByTestId('image')).toHaveCSS(
      'transform',
      'matrix(1.25, 0, 0, 1.25, 293.333, 83.75)',
    )
  })

  test('drags in both directions after zooming', async ({ page }) => {
    await page.mouse.move(640, 360)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 50, 50)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 50, 50)')

    await dragImage(page, -100, -100)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, -50, -50)')
  })

  test('limits movement after zooming and recenters after zooming out', async ({ page }) => {
    await page.mouse.move(640, 360)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 0, -1000)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 0, -167.5)')

    await page.mouse.move(640, 360)
    await page.mouse.wheel(0, 100)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })
})

test.describe('touch interactions', () => {
  test.use({ hasTouch: true })
  test.beforeEach(async ({ page }) => openCropper(page))

  test('moves the image with one finger', async ({ page }) => {
    const container = page.getByTestId('container')
    await sendTouchEvent(container, 'touchstart', [{ identifier: 0, clientX: 0, clientY: 0 }])
    await sendTouchEvent(container, 'touchmove', [{ identifier: 0, clientX: 50, clientY: 0 }])
    await sendTouchEvent(container, 'touchend', [])
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 50, 0)')
  })

  test('limits touch dragging at the edges', async ({ page }) => {
    const container = page.getByTestId('container')
    await sendTouchEvent(container, 'touchstart', [{ identifier: 0, clientX: 0, clientY: 0 }])
    await sendTouchEvent(container, 'touchmove', [{ identifier: 0, clientX: -1000, clientY: 0 }])
    await sendTouchEvent(container, 'touchend', [])
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -193.333, 0)')

    await sendTouchEvent(container, 'touchstart', [{ identifier: 0, clientX: 0, clientY: 0 }])
    await sendTouchEvent(container, 'touchmove', [{ identifier: 0, clientX: 1000, clientY: 0 }])
    await sendTouchEvent(container, 'touchend', [])
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 193.333, 0)')
  })

  test('zooms with a pinch gesture', async ({ page }) => {
    await pinch(page, 10)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(2, 0, 0, 2, 640, 335)')

    await pinch(page, -4)
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.2, 0, 0, 1.2, 128, 57)')
  })

  test('keeps the rotation while zooming with a pinch gesture', async ({ page }) => {
    await page.goto('/?rotation=90')
    await pinch(page, 10)
    const matrix = await page.getByTestId('image').evaluate(element => {
      const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform)
      return { a: transform.a, b: transform.b, c: transform.c, d: transform.d }
    })
    expect(matrix.a).toBeCloseTo(0)
    expect(matrix.b).toBeCloseTo(2)
    expect(matrix.c).toBeCloseTo(-2)
    expect(matrix.d).toBeCloseTo(0)
  })

  test('zooms around the midpoint between touches', async ({ page }) => {
    const container = page.getByTestId('container')
    await sendTouchEvent(container, 'touchstart', [
      { identifier: 0, clientX: 500, clientY: 200 },
      { identifier: 1, clientX: 500, clientY: 300 },
    ])
    await sendTouchEvent(container, 'touchmove', [
      { identifier: 0, clientX: 500, clientY: 200 },
      { identifier: 1, clientX: 500, clientY: 310 },
    ])
    await sendTouchEvent(container, 'touchend', [])
    // Midpoint of the move event is (500, 255): zooming 1 -> 1.1 about
    // container point (140, 105) lands the crop at (14, 10.5).
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1.1, 0, 0, 1.1, 14, 10.5)')
  })

  test('zooms out around the midpoint between touches', async ({ page }) => {
    const container = page.getByTestId('container')
    await sendTouchEvent(container, 'touchstart', [
      { identifier: 0, clientX: 100, clientY: 50 },
      { identifier: 1, clientX: 200, clientY: 50 },
    ])
    await sendTouchEvent(container, 'touchmove', [
      { identifier: 0, clientX: 100, clientY: 50 },
      { identifier: 1, clientX: 190, clientY: 50 },
    ])
    await sendTouchEvent(container, 'touchend', [])
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(0.9, 0, 0, 0.9, -54, -31)')
  })

  test('moves the image around a pinch midpoint', async ({ page }) => {
    const container = page.getByTestId('container')
    await sendTouchEvent(container, 'touchstart', [
      { identifier: 0, clientX: 500, clientY: 200 },
      { identifier: 1, clientX: 600, clientY: 300 },
    ])
    await sendTouchEvent(container, 'touchmove', [
      { identifier: 0, clientX: 600, clientY: 200 },
      { identifier: 1, clientX: 700, clientY: 300 },
    ])
    await sendTouchEvent(container, 'touchend', [])
    await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 100, 0)')
  })
})

test.describe('new interaction and restoration features', () => {
  test.describe('touch rotation and gesture lifecycle', () => {
    test.use({ hasTouch: true })

    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e')
      await expect(page.getByTestId('cropper')).toBeVisible()
    })

    test('rotates by 90 degrees with two fingers and updates crop output', async ({ page }) => {
      const initialCrop = await readCropPayload(page)
      const container = page.getByTestId('container')
      const start = await touchPairAtCenter(page, 0)
      const rotated = await touchPairAtCenter(page, 90)

      await sendTouchEvent(container, 'touchstart', start)
      await sendTouchEvent(container, 'touchmove', rotated)
      await sendTouchEvent(container, 'touchend', [])

      await expect(page.getByTestId('rotation')).toHaveText('90')
      const matrix = await readImageMatrix(page)
      expect(matrix.a).toBeCloseTo(0)
      expect(matrix.b).toBeCloseTo(1)
      expect(matrix.c).toBeCloseTo(-1)
      expect(matrix.d).toBeCloseTo(0)

      await expect
        .poll(async () => (await readCropPayload(page)).percent.width)
        .not.toBe(initialCrop.percent.width)
    })

    test('keeps small rotations continuous when touch angles cross either 180-degree boundary', async ({ page }) => {
      const container = page.getByTestId('container')
      await sendTouchEvent(container, 'touchstart', await touchPairAtCenter(page, 179))
      await sendTouchEvent(container, 'touchmove', await touchPairAtCenter(page, -179))
      await expect
        .poll(async () => Number(await page.getByTestId('rotation').textContent()))
        .toBeCloseTo(2, 1)
      await sendTouchEvent(container, 'touchend', [])

      await sendTouchEvent(container, 'touchstart', await touchPairAtCenter(page, -179))
      await sendTouchEvent(container, 'touchmove', await touchPairAtCenter(page, 179))
      await expect
        .poll(async () => Number(await page.getByTestId('rotation').textContent()))
        .toBeCloseTo(0, 1)
      await sendTouchEvent(container, 'touchend', [])
    })

    test('transitions from a pinch to dragging with the remaining finger without a jump', async ({ page }) => {
      const container = page.getByTestId('container')
      const start = await touchPairAtCenter(page, 0, 100)
      const zoomed = await touchPairAtCenter(page, 0, 120)
      await sendTouchEvent(container, 'touchstart', start)
      await sendTouchEvent(container, 'touchmove', zoomed)

      const remainingFinger = zoomed[0]
      const movedFinger = { ...remainingFinger, clientX: remainingFinger.clientX + 20 }
      await sendTouchEvent(container, 'touchend', [remainingFinger], [zoomed[1]])
      await sendTouchEvent(container, 'touchmove', [movedFinger])
      await sendTouchEvent(container, 'touchend', [], [movedFinger])

      await expect(page.getByTestId('zoom')).toHaveText('1.2')
      await expect.poll(async () => (await readImageMatrix(page)).e).toBeCloseTo(20)
      const matrix = await readImageMatrix(page)
      expect(matrix.a).toBeCloseTo(1.2)
      expect(matrix.b).toBeCloseTo(0)
      expect(matrix.c).toBeCloseTo(0)
      expect(matrix.d).toBeCloseTo(1.2)
      expect(matrix.e).toBeCloseTo(20)
      expect(matrix.f).toBeCloseTo(0)
    })

    test('clears a canceled pinch before accepting a new one-finger drag', async ({ page }) => {
      const container = page.getByTestId('container')
      await sendTouchEvent(container, 'touchstart', await touchPairAtCenter(page, 0, 100))
      await sendTouchEvent(container, 'touchmove', await touchPairAtCenter(page, 45, 120))
      await sendTouchEvent(container, 'touchcancel', [])

      const matrixBeforeDrag = await readImageMatrix(page)
      const box = await container.boundingBox()
      if (!box) throw new Error('Cropper container has no bounding box')
      const first = { identifier: 2, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }
      const next = { ...first, clientX: first.clientX + 30 }
      await sendTouchEvent(container, 'touchstart', [first])
      await sendTouchEvent(container, 'touchmove', [next])
      await sendTouchEvent(container, 'touchend', [], [next])

      await expect
        .poll(async () => (await readImageMatrix(page)).e - matrixBeforeDrag.e)
        .toBeCloseTo(30)
      const matrixAfterDrag = await readImageMatrix(page)
      expect(matrixAfterDrag.a).toBeCloseTo(matrixBeforeDrag.a)
      expect(matrixAfterDrag.b).toBeCloseTo(matrixBeforeDrag.b)
      expect(matrixAfterDrag.c).toBeCloseTo(matrixBeforeDrag.c)
      expect(matrixAfterDrag.d).toBeCloseTo(matrixBeforeDrag.d)
      expect(matrixAfterDrag.e - matrixBeforeDrag.e).toBeCloseTo(30)
      expect(matrixAfterDrag.f - matrixBeforeDrag.f).toBeCloseTo(0)
    })
  })

  test('handles Safari gesture events for zoom and rotation', async ({ page }) => {
    await page.goto('/e2e')
    await readCropPayload(page)
    const initialCount = Number(await page.getByTestId('complete-count').textContent())

    expect(await dispatchSafariGesture(page, 'gesturestart', 1, 0)).toBe(true)
    expect(await dispatchSafariGesture(page, 'gesturechange', 1.5, 45)).toBe(true)
    await expect(page.getByTestId('zoom')).toHaveText('1.5')
    await expect(page.getByTestId('rotation')).toHaveText('45')
    expect(await dispatchSafariGesture(page, 'gestureend', 1.5, 45)).toBe(true)
    await expect(page.getByTestId('complete-count')).toHaveText(String(initialCount + 1))
  })

  test.describe('keyboard movement', () => {
    test('uses one-pixel arrow steps by default and emits completion on keyup', async ({ page }) => {
      await page.goto('/e2e')
      const container = page.getByTestId('container')
      await expect(container).toHaveAttribute('tabindex', '0')
      await container.focus()

      const initialCount = Number(await page.getByTestId('complete-count').textContent())
      await page.keyboard.down('ArrowRight')
      await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 1, 0)')
      await expect(page.getByTestId('complete-count')).toHaveText(String(initialCount))

      await page.keyboard.up('ArrowRight')
      await expect(page.getByTestId('complete-count')).toHaveText(String(initialCount + 1))
    })

    test('uses Shift with the configured keyboard step', async ({ page }) => {
      await page.goto('/e2e?keyboardStep=5')
      const container = page.getByTestId('container')
      await expect(container).toHaveAttribute('tabindex', '0')
      await container.focus()

      await page.keyboard.press('Shift+ArrowRight')
      await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 1, 0)')
    })

    test('restricts keyboard movement at the crop edges', async ({ page }) => {
      await page.goto('/e2e?keyboardStep=500')
      const container = page.getByTestId('container')
      await container.focus()

      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 193.333, 0)')
      await page.keyboard.press('ArrowLeft')
      await expect(page.getByTestId('image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -193.333, 0)')
    })
  })

  test('preserves the requested crop, zoom, and rotation during initial measurement', async ({ page }) => {
    await page.goto('/e2e?crop=40,20&zoom=1.5&rotation=90')
    await expect(page.getByTestId('cropper')).toBeVisible()
    await expect(page.getByTestId('zoom')).toHaveText('1.5')
    await expect(page.getByTestId('rotation')).toHaveText('90')

    const matrix = await readImageMatrix(page)
    expect(matrix.a).toBeCloseTo(0)
    expect(matrix.b).toBeCloseTo(1.5)
    expect(matrix.c).toBeCloseTo(-1.5)
    expect(matrix.d).toBeCloseTo(0)
    expect(matrix.e).toBeCloseTo(40)
    expect(matrix.f).toBeCloseTo(20)
  })

  test('keeps the visible crop when only its parent is resized while zoomed and panned', async ({ page }) => {
    await page.goto('/e2e?parentWidth=800&parentHeight=500')
    const container = page.getByTestId('container')
    await expect(page.getByTestId('cropper')).toBeVisible()
    await page.mouse.move(400, 250)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 50, 30)
    await expect(page.getByTestId('zoom')).toHaveText('1.5')
    const before = await readCropPayload(page, 'live-crop-data')
    const viewport = page.viewportSize()

    await page.getByTestId('resize-parent').click()
    await expectBox(page.getByTestId('parent'), 700, 440)
    expect(page.viewportSize()).toEqual(viewport)
    await expect.poll(async () => Number(await page.getByTestId('zoom').textContent())).toBeGreaterThan(1.4)
    await expect
      .poll(async () => (await readCropPayload(page, 'live-crop-data')).percent.width)
      .toBeCloseTo(before.percent.width, 0)

    const after = await readCropPayload(page, 'live-crop-data')
    expectAreaToMatch(after.percent, before.percent, 0)
    await expect(container).toBeVisible()
  })

  test('initializes after a hidden parent becomes visible', async ({ page }) => {
    await page.goto('/e2e?hidden=1&parentWidth=800&parentHeight=500')
    await expect(page.getByTestId('parent')).toBeHidden()
    await expect(page.getByTestId('cropper')).toHaveCount(0)

    await page.getByTestId('toggle-visible').click()
    await expect(page.getByTestId('cropper')).toBeVisible()
    await expect(page.getByTestId('crop-data')).toContainText('percent')
    await expectBox(page.getByTestId('image'), 800, 419)
  })

  test('restores a saved percentage crop after remounting a rotated image', async ({ page }) => {
    await page.goto('/e2e?rotation=90')
    await expect(page.getByTestId('cropper')).toBeVisible()
    const initialCrop = await readCropPayload(page)
    await page.mouse.move(640, 360)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 50, 30)
    await expect(page.getByTestId('zoom')).toHaveText('1.5')
    await expect
      .poll(async () => JSON.stringify(await readCropPayload(page)))
      .not.toBe(JSON.stringify(initialCrop))
    const saved = await readCropPayload(page)

    await page.goto(`/e2e?rotation=90&percent=${encodeURIComponent(areaQuery(saved.percent))}`)
    await expect(page.getByTestId('cropper')).toBeVisible()
    const restored = await readCropPayload(page)
    expectAreaToMatch(restored.percent, saved.percent)
  })

  test('gives saved percentages precedence over conflicting pixels', async ({ page }) => {
    await page.goto('/e2e')
    const percentageCrop = await readCropPayload(page)
    const conflictingPixels: CropArea = {
      ...percentageCrop.pixels,
      x: percentageCrop.pixels.x + 100,
    }
    expect(conflictingPixels.x).not.toBe(percentageCrop.pixels.x)

    await page.goto(
      `/e2e?percent=${encodeURIComponent(areaQuery(percentageCrop.percent))}&pixels=${encodeURIComponent(areaQuery(conflictingPixels))}`,
    )
    const restored = await readCropPayload(page)
    expectAreaToMatch(restored.percent, percentageCrop.percent)
  })

  test('restores a saved pixel crop after remounting rotated video', async ({ page }) => {
    await page.goto('/e2e?video=1&rotation=90')
    const video = page.getByTestId('video')
    await expect(video).toBeVisible()
    await expect
      .poll(() => video.evaluate(element => (element instanceof HTMLVideoElement ? element.videoWidth : 0)))
      .toBeGreaterThan(0)
    const saved = await readCropPayload(page)

    await page.goto(`/e2e?video=1&rotation=90&pixels=${encodeURIComponent(areaQuery(saved.pixels))}`)
    await expect(video).toBeVisible()
    await expect
      .poll(() => video.evaluate(element => (element instanceof HTMLVideoElement ? element.videoWidth : 0)))
      .toBeGreaterThan(0)
    const restored = await readCropPayload(page)
    expectAreaToMatch(restored.pixels, saved.pixels, 0)
  })
})

test.describe('object fit', () => {
  test('contain keeps the whole media visible', async ({ page }) => {
    await page.goto('/e2e?objectFit=contain&parentWidth=480&parentHeight=360')
    await expectBox(page.getByTestId('image'), 480, 251)
    await expect(page.getByTestId('media-size')).toHaveText('{"width":480,"height":251}')
  })

  test('horizontal-cover fills the cropper width', async ({ page }) => {
    await page.goto('/e2e?objectFit=horizontal-cover&parentWidth=480&parentHeight=360')
    await expect(page.getByTestId('image')).toHaveClass(/cover-horizontal/)
    await expectBox(page.getByTestId('image'), 480, 251)
  })

  test('vertical-cover fills the cropper height', async ({ page }) => {
    await page.goto('/e2e?objectFit=vertical-cover&parentWidth=480&parentHeight=360')
    await expect(page.getByTestId('image')).toHaveClass(/cover-vertical/)
    await expectBox(page.getByTestId('image'), 688, 360)
  })

  test('cover resolves against the media and container aspect', async ({ page }) => {
    // dog.jpeg is wider than the 480x360 container, so cover fills the height.
    await page.goto('/e2e?objectFit=cover&parentWidth=480&parentHeight=360')
    await expect(page.getByTestId('image')).toHaveClass(/cover-vertical/)
    await expectBox(page.getByTestId('image'), 688, 360)

    // In a wide, short container cover fills the width instead.
    await page.goto('/e2e?objectFit=cover&parentWidth=1280&parentHeight=400')
    await expect(page.getByTestId('image')).toHaveClass(/cover-horizontal/)
    await expectBox(page.getByTestId('image'), 1280, 670)
  })
})

test.describe('onMediaLoaded', () => {
  test('reports the rendered media size once per source', async ({ page }) => {
    await page.goto('/e2e?objectFit=vertical-cover&parentWidth=480&parentHeight=360')
    await expect(page.getByTestId('media-size')).toHaveText(
      '{"width":687.6,"height":360}',
    )
    await expect(page.getByTestId('media-loaded-count')).toHaveText('1')
  })
})

test.describe('zoomWithScroll', () => {
  test('zooms with the wheel by default', async ({ page }) => {
    await page.goto('/e2e?parentWidth=480&parentHeight=360')
    await expect(page.getByTestId('zoom')).toHaveText('1')
    await page.mouse.move(240, 180)
    await page.mouse.wheel(0, -400)
    await expect(page.getByTestId('zoom')).toHaveText('3')
  })

  test('leaves the wheel alone when disabled', async ({ page }) => {
    await page.goto('/e2e?zoomWithScroll=0&parentWidth=480&parentHeight=360')
    await expect(page.getByTestId('zoom')).toHaveText('1')
    await page.mouse.move(240, 180)
    await page.mouse.wheel(0, -400)
    await expect(page.getByTestId('zoom')).toHaveText('1')
  })
})
