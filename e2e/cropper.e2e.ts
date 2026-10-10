import { expect, test, type Locator, type Page } from '@playwright/test'

type TouchPoint = {
  identifier: number
  clientX: number
  clientY: number
}

type TouchEventName = 'touchstart' | 'touchmove' | 'touchend'

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
): Promise<void> {
  const touches = type === 'touchend' ? [] : points
  await container.dispatchEvent(type, { touches, changedTouches: touches, targetTouches: touches })
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
