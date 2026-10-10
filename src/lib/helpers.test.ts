import { describe, expect, test } from 'vitest'
import * as helpers from './helpers.js'

describe('Helpers', () => {
  describe('getCropSize', () => {
    test('when image width is higher than the height based on the aspect', () => {
      const cropSize = helpers.getCropSize(1200, 600, 1200, 600, 4 / 3)
      expect(cropSize).toEqual({ height: 600, width: 800 })
    })
    test('when image width is smaller than the height based on the aspect', () => {
      const cropSize = helpers.getCropSize(600, 1200, 600, 1200, 4 / 3)
      expect(cropSize).toEqual({ height: 450, width: 600 })
    })
    test('when image dimensions exactly match the aspect', () => {
      const cropSize = helpers.getCropSize(800, 600, 800, 600, 4 / 3)
      expect(cropSize).toEqual({ height: 600, width: 800 })
    })

    test('fits the rotated media bounds inside the container', () => {
      const cropSize = helpers.getCropSize(100, 50, 80, 80, 4 / 3, 90)
      expect(cropSize.width).toBeCloseTo(50)
      expect(cropSize.height).toBeCloseTo(37.5)
    })
  })

  describe('restrictPosition', () => {
    test('position within the cropped area should be returned as-is', () => {
      const position = { x: 0, y: 0 }
      const imgSize = { width: 1000, height: 600 }
      const cropSize = { width: 500, height: 200 }
      const zoom = 1
      const result = helpers.restrictPosition(position, imgSize, cropSize, zoom)
      expect(result).toEqual({ x: 0, y: 0 })
    })

    test('position too far on the bottom-right should be limited', () => {
      const position = { x: 600, y: 500 }
      const imgSize = { width: 1000, height: 500 }
      const cropSize = { width: 500, height: 200 }
      const zoom = 1
      const result = helpers.restrictPosition(position, imgSize, cropSize, zoom)
      expect(result).toEqual({ x: 250, y: 150 })
    })

    test('position too far on the top-left should be limited', () => {
      const position = { x: -600, y: -500 }
      const imgSize = { width: 1000, height: 500 }
      const cropSize = { width: 500, height: 200 }
      const zoom = 1
      const result = helpers.restrictPosition(position, imgSize, cropSize, zoom)
      expect(result).toEqual({ x: -250, y: -150 })
    })

    test('when zoomed, we should be able to drag the image further', () => {
      const position = { x: 500, y: 300 }
      const imgSize = { width: 1000, height: 500 }
      const cropSize = { width: 500, height: 200 }
      const zoom = 2
      const result = helpers.restrictPosition(position, imgSize, cropSize, zoom)
      expect(result).toEqual({ x: 500, y: 300 })
    })

    test('when zoomed, position should still be limited', () => {
      const position = { x: 5000, y: 3000 }
      const imgSize = { width: 1000, height: 500 }
      const cropSize = { width: 500, height: 200 }
      const zoom = 3
      const result = helpers.restrictPosition(position, imgSize, cropSize, zoom)
      expect(result).toEqual({ x: 1250, y: 650 })
    })
  })

  describe('getDistanceBetweenPoints', () => {
    test('should handle horizontal distance only', () => {
      const a = { x: 0, y: 0 }
      const b = { x: 100, y: 0 }
      const distance = helpers.getDistanceBetweenPoints(a, b)
      expect(distance).toEqual(100)
    })

    test('should handle vertical distance only', () => {
      const a = { x: 0, y: 200 }
      const b = { x: 0, y: 0 }
      const distance = helpers.getDistanceBetweenPoints(a, b)
      expect(distance).toEqual(200)
    })

    test('should handle horizontal and vertical distance', () => {
      const a = { x: 0, y: 50 }
      const b = { x: 25, y: 0 }
      const distance = helpers.getDistanceBetweenPoints(a, b)
      expect(distance).toBeCloseTo(55.9)
    })
  })

  describe('rotation', () => {
    test('computes the bounding size after rotation', () => {
      const size = helpers.rotateSize(100, 50, 90)
      expect(size.width).toBeCloseTo(50)
      expect(size.height).toBeCloseTo(100)
    })

    test('rotates a centered point', () => {
      const point = helpers.rotatePoint({ x: 1, y: 0 }, 90)
      expect(point.x).toBeCloseTo(0)
      expect(point.y).toBeCloseTo(1)
    })

    test('restricts position using the rotated media bounds', () => {
      const position = helpers.restrictPosition({ x: 100, y: 100 }, { width: 100, height: 50 }, { width: 30, height: 30 }, 1, 90)
      expect(position.x).toBeCloseTo(10)
      expect(position.y).toBeCloseTo(35)
    })
  })

  describe('computeCroppedArea', () => {
    test('should compute the correct areas when the image was not moved', () => {
      const crop = { x: 0, y: 0 }
      const imgSize = { width: 1000, height: 600, naturalWidth: 2000, naturalHeight: 1200 }
      const cropSize = { width: 500, height: 300 }
      const aspect = 5 / 3
      const zoom = 1
      const areas = helpers.computeCroppedArea(crop, imgSize, cropSize, aspect, zoom)
      expect(areas.croppedAreaPercentages).toEqual({ x: 25, y: 25, width: 50, height: 50 })
      expect(areas.croppedAreaPixels).toEqual({ height: 600, width: 1000, x: 500, y: 300 })
    })

    test('should compute the correct areas when the image was moved', () => {
      const crop = { x: 100, y: 30 }
      const imgSize = { width: 1000, height: 600, naturalWidth: 2000, naturalHeight: 1200 }
      const cropSize = { width: 500, height: 300 }
      const aspect = 5 / 3
      const zoom = 1
      const areas = helpers.computeCroppedArea(crop, imgSize, cropSize, aspect, zoom)
      expect(areas.croppedAreaPercentages).toEqual({ height: 50, width: 50, x: 15, y: 20 })
      expect(areas.croppedAreaPixels).toEqual({ height: 600, width: 1000, x: 300, y: 240 })
    })

    test('should compute the correct areas when there is a zoom', () => {
      const crop = { x: 0, y: 0 }
      const imgSize = { width: 1000, height: 600, naturalWidth: 2000, naturalHeight: 1200 }
      const cropSize = { width: 500, height: 300 }
      const aspect = 5 / 3
      const zoom = 2
      const areas = helpers.computeCroppedArea(crop, imgSize, cropSize, aspect, zoom)
      expect(areas.croppedAreaPercentages).toEqual({ height: 25, width: 25, x: 37.5, y: 37.5 })
      expect(areas.croppedAreaPixels).toEqual({ height: 300, width: 500, x: 750, y: 450 })
    })

    test('computes height from width for portrait images to preserve the aspect', () => {
      const crop = { x: 0, y: 0 }
      const imgSize = { width: 300, height: 600, naturalWidth: 600, naturalHeight: 1200 }
      const cropSize = { width: 300, height: 225 }
      const aspect = 4 / 3
      const zoom = 1
      const areas = helpers.computeCroppedArea(crop, imgSize, cropSize, aspect, zoom)
      expect(areas.croppedAreaPercentages).toEqual({ x: 0, y: 31.25, width: 100, height: 37.5 })
      expect(areas.croppedAreaPixels).toEqual({ width: 600, height: 450, x: 0, y: 375 })
    })

    test('should not limit the position within image bounds when restrictPosition is false', () => {
      const crop = { x: 1000, y: 600 }
      const imgSize = { width: 1000, height: 600, naturalWidth: 2000, naturalHeight: 1200 }
      const cropSize = { width: 500, height: 300 }
      const aspect = 4 / 3
      const zoom = 1
      const areas = helpers.computeCroppedArea(crop, imgSize, cropSize, aspect, zoom, 0, false)
      expect(areas.croppedAreaPercentages).toEqual({ height: 50, width: 50, x: -75, y: -75 })
      expect(areas.croppedAreaPixels).toEqual({ height: 600, width: 800, x: -1500, y: -900 })
    })

    test('computes crop data against the rotated media bounds', () => {
      const areas = helpers.computeCroppedArea(
        { x: 0, y: 0 },
        { width: 100, height: 50, naturalWidth: 200, naturalHeight: 100 },
        { width: 50, height: 50 },
        1,
        1,
        90,
      )
      expect(areas.croppedAreaPercentages.x).toBeCloseTo(0)
      expect(areas.croppedAreaPercentages.y).toBeCloseTo(25)
      expect(areas.croppedAreaPercentages.width).toBeCloseTo(100)
      expect(areas.croppedAreaPercentages.height).toBeCloseTo(50)
      expect(areas.croppedAreaPixels).toEqual({ x: 0, y: 50, width: 100, height: 100 })
    })
  })

  describe('getInitialCropFromCroppedAreaPercentages', () => {
    test.each([0, 90, 37])('restores crop and zoom after %i degree rotation', rotation => {
      const mediaSize = { width: 600, height: 360, naturalWidth: 1200, naturalHeight: 720 }
      const cropSize = { width: 240, height: 160 }
      const crop = { x: 39, y: -22 }
      const zoom = 1.7
      const areas = helpers.computeCroppedArea(
        crop,
        mediaSize,
        cropSize,
        cropSize.width / cropSize.height,
        zoom,
        rotation,
      )

      const restored = helpers.getInitialCropFromCroppedAreaPercentages({
        croppedAreaPercentages: areas.croppedAreaPercentages,
        mediaSize,
        rotation,
        cropSize,
      })

      expect(restored.zoom).toBeCloseTo(zoom)
      expect(restored.crop.x).toBeCloseTo(crop.x)
      expect(restored.crop.y).toBeCloseTo(crop.y)
    })

    test('uses the clamped zoom to restore position', () => {
      const restored = helpers.getInitialCropFromCroppedAreaPercentages({
        croppedAreaPercentages: { x: 25, y: 25, width: 50, height: 50 },
        mediaSize: { width: 1000, height: 500, naturalWidth: 1000, naturalHeight: 500 },
        cropSize: { width: 500, height: 250 },
        minZoom: 2,
        maxZoom: 3,
      })

      expect(restored).toEqual({ crop: { x: 250, y: 125 }, zoom: 2 })
    })

    test('allows negative area positions and returns an unrestricted crop', () => {
      const restored = helpers.getInitialCropFromCroppedAreaPercentages({
        croppedAreaPercentages: { x: 75, y: -10, width: 50, height: 50 },
        mediaSize: { width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 },
        cropSize: { width: 50, height: 50 },
      })

      expect(restored.crop.x).toBeLessThan(0)
      expect(Number.isFinite(restored.crop.y)).toBe(true)
    })

    test('rejects invalid geometry and zoom intervals', () => {
      const validOptions = {
        croppedAreaPercentages: { x: 0, y: 0, width: 50, height: 50 },
        mediaSize: { width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 },
        cropSize: { width: 50, height: 50 },
      }

      expect(() =>
        helpers.getInitialCropFromCroppedAreaPercentages({
          ...validOptions,
          cropSize: { width: 0, height: 50 },
        }),
      ).toThrow(RangeError)
      expect(() =>
        helpers.getInitialCropFromCroppedAreaPercentages({
          ...validOptions,
          croppedAreaPercentages: { ...validOptions.croppedAreaPercentages, width: Number.NaN },
        }),
      ).toThrow(RangeError)
      expect(() =>
        helpers.getInitialCropFromCroppedAreaPercentages({ ...validOptions, minZoom: 3, maxZoom: 2 }),
      ).toThrow(RangeError)
    })
  })

  describe('getInitialCropFromCroppedAreaPixels', () => {
    test.each([0, 90, 37])('restores crop from pixels after %i degree rotation', rotation => {
      const mediaSize = { width: 600, height: 360, naturalWidth: 1200, naturalHeight: 720 }
      const cropSize = { width: 240, height: 160 }
      const crop = { x: 39, y: -22 }
      const zoom = 1.7
      const areas = helpers.computeCroppedArea(
        crop,
        mediaSize,
        cropSize,
        cropSize.width / cropSize.height,
        zoom,
        rotation,
      )

      const restored = helpers.getInitialCropFromCroppedAreaPixels({
        croppedAreaPixels: areas.croppedAreaPixels,
        mediaSize,
        rotation,
        cropSize,
      })

      expect(restored.zoom).toBeCloseTo(zoom, 1)
      expect(restored.crop.x).toBeCloseTo(crop.x, 0)
      expect(restored.crop.y).toBeCloseTo(crop.y, 0)
    })

    test('rejects invalid pixel areas', () => {
      expect(() =>
        helpers.getInitialCropFromCroppedAreaPixels({
          croppedAreaPixels: { x: 0, y: 0, width: 0, height: 10 },
          mediaSize: { width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 },
          cropSize: { width: 50, height: 50 },
        }),
      ).toThrow(RangeError)
    })
  })

  describe('getCenter', () => {
    test('should simply return the center between a and b', () => {
      const center = helpers.getCenter({ x: 0, y: 0 }, { x: 100, y: 0 })
      expect(center).toEqual({ x: 50, y: 0 })
    })

    test.each([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 50 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 50 },
      ],
      [
        { x: 100, y: 1000 },
        { x: 0, y: 400 },
        { x: 50, y: 700 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    ])('.getCenter(%o, %o)', (a, b, expected) => {
      const center = helpers.getCenter(a, b)
      expect(center).toEqual(expected)
    })
  })
})
