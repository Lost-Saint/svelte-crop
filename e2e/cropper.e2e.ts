import { expect, test, type Page } from '@playwright/test'

type TouchPoint = {
  identifier: number
  clientX: number
  clientY: number
}

type TouchEventName = 'touchstart' | 'touchmove' | 'touchend'

async function openCropper(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('cropper')).toBeVisible()
}

async function dragImage(page: Page, x: number, y: number) {
  await page.mouse.move(0, 0)
  await page.mouse.down()
  await page.mouse.move(x, y)
  await page.mouse.up()
}

async function sendTouchEvent(page: Page, type: TouchEventName, points: TouchPoint[]) {
  await page.evaluate(
    ({ type, points }) => {
      const target = document.querySelector<HTMLElement>('[data-testid="container"]')
      if (!target) throw new Error('Cropper container was not found')

      const touches = points.map(
        ({ identifier, clientX, clientY }) =>
          new Touch({ identifier, target, clientX, clientY }),
      )
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches }))
    },
    { type, points },
  )
}

async function pinch(page: Page, distance: number) {
  await sendTouchEvent(page, 'touchstart', [
    { identifier: 0, clientX: 0, clientY: 0 },
    { identifier: 1, clientX: 0, clientY: 10 },
  ])
  await sendTouchEvent(page, 'touchmove', [
    { identifier: 0, clientX: 0, clientY: 0 },
    { identifier: 1, clientX: 0, clientY: 10 + distance },
  ])
  await sendTouchEvent(page, 'touchend', [])
}

test.describe('cropper sizing', () => {
  test.beforeEach(async ({ page }) => openCropper(page))

  test('fits a landscape image and crop area to the viewport', async ({ page }) => {
    await expect(page.locator('img')).toHaveCSS('width', '1000px')
    await expect(page.locator('img')).toHaveCSS('height', '523.546875px')
    await expect(page.getByTestId('cropper')).toHaveCSS('width', '698.65625px')
    await expect(page.getByTestId('cropper')).toHaveCSS('height', '524px')
  })

  test('fits a portrait image to the viewport', async ({ page }) => {
    await page.goto('/?img=/images/cat.jpeg')
    await expect(page.locator('img')).toHaveCSS('width', '338.4375px')
    await expect(page.locator('img')).toHaveCSS('height', '600px')
    await expect(page.getByTestId('cropper')).toHaveCSS('width', '338px')
    await expect(page.getByTestId('cropper')).toHaveCSS('height', '253.5px')
  })

  test('recomputes image and crop dimensions after a viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 1000 })
    await expect(page.locator('img')).toHaveCSS('width', '600px')
    await expect(page.locator('img')).toHaveCSS('height', '314.125px')
    await expect(page.getByTestId('cropper')).toHaveCSS('width', '418.65625px')
    await expect(page.getByTestId('cropper')).toHaveCSS('height', '314px')
  })
})

test.describe('mouse interactions', () => {
  test.beforeEach(async ({ page }) => openCropper(page))

  test('moves the image and limits dragging at the edges', async ({ page }) => {
    await dragImage(page, 50, 0)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 50, 0)')

    await dragImage(page, -1000, 0)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -150.667, 0)')

    await dragImage(page, 1000, 0)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 150.667, 0)')
  })

  test('zooms with the mouse wheel', async ({ page }) => {
    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, -100)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 0, 0)')

    await page.mouse.wheel(0, 50)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.25, 0, 0, 1.25, 0, 0)')
  })

  test('zooms around the pointer', async ({ page }) => {
    await page.mouse.move(0, 0)
    await page.mouse.wheel(0, -100)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 250, 131)')

    await page.mouse.move(800, 400)
    await page.mouse.wheel(0, 50)
    await expect(page.locator('img')).toHaveCSS(
      'transform',
      'matrix(1.25, 0, 0, 1.25, 258.333, 65.5)',
    )
  })

  test('drags in both directions after zooming', async ({ page }) => {
    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 50, 50)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 50, 50)')

    await page.reload()
    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, -100)
    await dragImage(page, -50, -50)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, -50, -50)')
  })

  test('limits movement after zooming and recenters after zooming out', async ({ page }) => {
    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 0, -1000)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 0, -131)')

    await page.reload()
    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, -100)
    await dragImage(page, 0, 1000)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.5, 0, 0, 1.5, 0, 131)')

    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, 100)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })
})

test.describe('touch interactions', () => {
  test.use({ hasTouch: true })
  test.beforeEach(async ({ page }) => openCropper(page))

  test('moves the image and limits dragging at the edges', async ({ page }) => {
    await sendTouchEvent(page, 'touchstart', [{ identifier: 0, clientX: 0, clientY: 0 }])
    await sendTouchEvent(page, 'touchmove', [{ identifier: 0, clientX: 50, clientY: 0 }])
    await sendTouchEvent(page, 'touchend', [])
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 50, 0)')

    await page.reload()
    await sendTouchEvent(page, 'touchstart', [{ identifier: 0, clientX: 0, clientY: 0 }])
    await sendTouchEvent(page, 'touchmove', [{ identifier: 0, clientX: -1000, clientY: 0 }])
    await sendTouchEvent(page, 'touchend', [])
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -150.667, 0)')

    await page.reload()
    await sendTouchEvent(page, 'touchstart', [{ identifier: 0, clientX: 0, clientY: 0 }])
    await sendTouchEvent(page, 'touchmove', [{ identifier: 0, clientX: 1000, clientY: 0 }])
    await sendTouchEvent(page, 'touchend', [])
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 150.667, 0)')
  })

  test('zooms with a pinch gesture', async ({ page }) => {
    await pinch(page, 10)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(2, 0, 0, 2, 500, 262)')

    await pinch(page, -4)
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.2, 0, 0, 1.2, 100, 37.2)')
  })

  test('zooms around the midpoint between touches', async ({ page }) => {
    await sendTouchEvent(page, 'touchstart', [
      { identifier: 0, clientX: 500, clientY: 200 },
      { identifier: 1, clientX: 500, clientY: 300 },
    ])
    await sendTouchEvent(page, 'touchmove', [
      { identifier: 0, clientX: 500, clientY: 200 },
      { identifier: 1, clientX: 500, clientY: 310 },
    ])
    await sendTouchEvent(page, 'touchend', [])
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1.1, 0, 0, 1.1, 0, 4.5)')

    await page.reload()
    await sendTouchEvent(page, 'touchstart', [
      { identifier: 0, clientX: 100, clientY: 50 },
      { identifier: 1, clientX: 200, clientY: 50 },
    ])
    await sendTouchEvent(page, 'touchmove', [
      { identifier: 0, clientX: 100, clientY: 50 },
      { identifier: 1, clientX: 190, clientY: 50 },
    ])
    await sendTouchEvent(page, 'touchend', [])
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(0.99, 0, 0, 0.99, -40, -2.62)')
  })

  test('moves the image around a pinch midpoint', async ({ page }) => {
    await sendTouchEvent(page, 'touchstart', [
      { identifier: 0, clientX: 500, clientY: 200 },
      { identifier: 1, clientX: 600, clientY: 300 },
    ])
    await sendTouchEvent(page, 'touchmove', [
      { identifier: 0, clientX: 600, clientY: 200 },
      { identifier: 1, clientX: 700, clientY: 300 },
    ])
    await sendTouchEvent(page, 'touchend', [])
    await expect(page.locator('img')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 100, 0)')
  })
})
