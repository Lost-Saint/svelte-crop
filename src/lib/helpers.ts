import type {
  CropArea,
  InitialCrop,
  InitialCropFromPercentagesOptions,
  InitialCropFromPixelsOptions,
  InitialCropGeometryOptions,
  MediaSize,
  ObjectFit,
  Point,
  ResolvedObjectFit,
  Size,
} from './types.js'

// NOTE: helpers keep positional parameters intentionally. They run inside
// requestAnimationFrame drag/zoom handlers (hot paths), where the
// typescript-best-practices "object args" rule is explicitly skipped.

/**
 * Compute the crop area dimensions from the media and container bounds.
 * @param mediaWidth width of the media in pixels
 * @param mediaHeight height of the media in pixels
 * @param containerWidth width of the cropper container
 * @param containerHeight height of the cropper container
 * @param aspect aspect ratio of the crop
 * @param rotation media rotation in degrees
 */
export function getCropSize(
  mediaWidth: number,
  mediaHeight: number,
  containerWidth: number,
  containerHeight: number,
  aspect: number,
  rotation = 0
): Size {
  const mediaBBoxSize = rotateSize(mediaWidth, mediaHeight, rotation)
  const fittingWidth = Math.min(mediaBBoxSize.width, containerWidth)
  const fittingHeight = Math.min(mediaBBoxSize.height, containerHeight)

  if (fittingWidth > fittingHeight * aspect) {
    return {
      width: fittingHeight * aspect,
      height: fittingHeight,
    }
  }
  return {
    width: fittingWidth,
    height: fittingWidth / aspect,
  }
}

/**
 * Resolve the `cover` object fit into the concrete fit for the given aspect
 * ratios. `cover` picks the axis whose fill keeps the whole media visible.
 */
export function resolveObjectFit(
  objectFit: ObjectFit,
  { containerAspect, mediaAspect }: { containerAspect: number; mediaAspect: number },
): ResolvedObjectFit {
  if (objectFit === 'cover') {
    return mediaAspect < containerAspect ? 'horizontal-cover' : 'vertical-cover'
  }
  return objectFit
}

/**
 * Compute the rendered media size for a given object fit.
 * `contain` scales the media down to stay fully visible (never up).
 * Cover fits fill one container axis and let the other overflow.
 */
export function getMediaSize(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  objectFit: ObjectFit = 'contain',
): Size {
  const mediaAspect = naturalWidth / naturalHeight
  const fit = resolveObjectFit(objectFit, {
    containerAspect: containerWidth / containerHeight,
    mediaAspect,
  })

  switch (fit) {
    case 'horizontal-cover':
      return { width: containerWidth, height: containerWidth / mediaAspect }
    case 'vertical-cover':
      return { width: containerHeight * mediaAspect, height: containerHeight }
    case 'contain': {
      const scale = Math.min(1, containerWidth / naturalWidth, containerHeight / naturalHeight)
      return {
        width: Math.round(naturalWidth * scale),
        height: Math.round(naturalHeight * scale),
      }
    }
    default: {
      const _exhaustive: never = fit
      return _exhaustive
    }
  }
}

/**
 * Ensure a new image position stays in the crop area.
 * @param position new x/y position requested for the image
 * @param imageSize width/height of the src image
 * @param cropSize width/height of the crop area
 * @param  zoom zoom value
 * @param rotation rotation in degrees
 * @returns
 */
export function restrictPosition(
  position: Point,
  imageSize: Size,
  cropSize: Size,
  zoom: number,
  rotation = 0
): Point {
  const { width, height } = rotateSize(imageSize.width, imageSize.height, rotation)

  return {
    x: restrictPositionCoord(position.x, width, cropSize.width, zoom),
    y: restrictPositionCoord(position.y, height, cropSize.height, zoom),
  }
}

function restrictPositionCoord(
  position: number,
  imageSize: number,
  cropSize: number,
  zoom: number
): number {
  // Default max position calculation
  const maxPosition = Math.abs((imageSize * zoom) / 2 - cropSize / 2)

  // Limit the image's position to inside the cropBox
  return clamp(position, -maxPosition, maxPosition)
}

export function getDistanceBetweenPoints(pointA: Point, pointB: Point): number {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
}

export function getRotationBetweenPoints(pointA: Point, pointB: Point): number {
  return (Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x) * 180) / Math.PI
}

export function rotatePoint(point: Point, rotation: number): Point {
  const radians = getRadianAngle(rotation)
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)

  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  }
}

/**
 * Compute the output cropped area of the image in percentages and pixels.
 * x/y are the top-left coordinates on the src image
 * @param  crop x/y position of the current center of the image
 * @param  imageSize width/height of the src image (default is size on the screen, natural is the original size)
 * @param  cropSize width/height of the crop area
 * @param aspect aspect value
 * @param zoom zoom value
 * @param rotation rotation in degrees
 * @param restrictPosition whether we should limit or not the cropped area
 */
export function computeCroppedArea(
  crop: Point,
  imgSize: MediaSize,
  cropSize: Size,
  aspect: number,
  zoom: number,
  rotation = 0,
  restrictPosition = true
): { croppedAreaPercentages: CropArea; croppedAreaPixels: CropArea } {
  const limitAreaFn = restrictPosition ? limitArea : noOp
  const mediaBBoxSize = rotateSize(imgSize.width, imgSize.height, rotation)
  const mediaNaturalBBoxSize = rotateSize(imgSize.naturalWidth, imgSize.naturalHeight, rotation)

  const croppedAreaPercentages = {
    x: limitAreaFn(
      100,
      (((mediaBBoxSize.width - cropSize.width / zoom) / 2 - crop.x / zoom) / mediaBBoxSize.width) *
        100
    ),
    y: limitAreaFn(
      100,
      (((mediaBBoxSize.height - cropSize.height / zoom) / 2 - crop.y / zoom) /
        mediaBBoxSize.height) *
        100
    ),
    width: limitAreaFn(100, ((cropSize.width / mediaBBoxSize.width) * 100) / zoom),
    height: limitAreaFn(100, ((cropSize.height / mediaBBoxSize.height) * 100) / zoom),
  }

  // we compute the pixels size naively
  const widthInPixels = limitAreaFn(
    mediaNaturalBBoxSize.width,
    (croppedAreaPercentages.width * mediaNaturalBBoxSize.width) / 100,
    true
  )
  const heightInPixels = limitAreaFn(
    mediaNaturalBBoxSize.height,
    (croppedAreaPercentages.height * mediaNaturalBBoxSize.height) / 100,
    true
  )
  const isImgWiderThanHigh = mediaNaturalBBoxSize.width >= mediaNaturalBBoxSize.height * aspect

  // then we ensure the width and height exactly match the aspect (to avoid rounding approximations)
  // if the image is wider than high, when zoom is 0, the crop height will be equals to iamge height
  // thus we want to compute the width from the height and aspect for accuracy.
  // Otherwise, we compute the height from width and aspect.
  const sizePixels = isImgWiderThanHigh
    ? {
        width: Math.round(heightInPixels * aspect),
        height: heightInPixels,
      }
    : {
        width: widthInPixels,
        height: Math.round(widthInPixels / aspect),
      }
  const croppedAreaPixels = {
    ...sizePixels,
    x: limitAreaFn(
      mediaNaturalBBoxSize.width - sizePixels.width,
      (croppedAreaPercentages.x * mediaNaturalBBoxSize.width) / 100,
      true
    ),
    y: limitAreaFn(
      mediaNaturalBBoxSize.height - sizePixels.height,
      (croppedAreaPercentages.y * mediaNaturalBBoxSize.height) / 100,
      true
    ),
  }
  return { croppedAreaPercentages, croppedAreaPixels }
}

/**
 * Restore the crop position and zoom from a previously reported percentage area.
 * The area is measured against the rotated media bounds, matching
 * `computeCroppedArea`.
 */
export function getInitialCropFromCroppedAreaPercentages({
  croppedAreaPercentages,
  mediaSize,
  rotation = 0,
  cropSize,
  minZoom = 1,
  maxZoom = 3,
}: InitialCropFromPercentagesOptions): InitialCrop {
  validateInitialCropInputs(
    { mediaSize, rotation, cropSize, minZoom, maxZoom },
    croppedAreaPercentages,
  )

  const mediaBBoxSize = rotateSize(mediaSize.width, mediaSize.height, rotation)
  validatePositiveFiniteSize(mediaBBoxSize, 'rotated media size')

  const requestedZoom = ((cropSize.width / mediaBBoxSize.width) * 100) / croppedAreaPercentages.width
  assertFiniteNumber(requestedZoom, 'requested zoom')
  const zoom = clamp(requestedZoom, minZoom, maxZoom)

  const scaledMediaWidth = mediaBBoxSize.width * zoom
  const scaledMediaHeight = mediaBBoxSize.height * zoom
  const crop = {
    x:
      scaledMediaWidth / 2 -
      cropSize.width / 2 -
      (scaledMediaWidth * croppedAreaPercentages.x) / 100,
    y:
      scaledMediaHeight / 2 -
      cropSize.height / 2 -
      (scaledMediaHeight * croppedAreaPercentages.y) / 100,
  }

  assertFiniteNumber(crop.x, 'crop.x')
  assertFiniteNumber(crop.y, 'crop.y')
  assertFiniteNumber(zoom, 'zoom')
  return { crop, zoom }
}

/**
 * Restore the crop position and zoom from a previously reported pixel area.
 * Pixel coordinates are measured against the rotated natural media bounds,
 * matching `computeCroppedArea`.
 */
export function getInitialCropFromCroppedAreaPixels({
  croppedAreaPixels,
  mediaSize,
  rotation = 0,
  cropSize,
  minZoom = 1,
  maxZoom = 3,
}: InitialCropFromPixelsOptions): InitialCrop {
  validateInitialCropInputs(
    { mediaSize, rotation, cropSize, minZoom, maxZoom },
    croppedAreaPixels,
  )

  const mediaNaturalBBoxSize = rotateSize(mediaSize.naturalWidth, mediaSize.naturalHeight, rotation)
  validatePositiveFiniteSize(mediaNaturalBBoxSize, 'rotated natural media size')

  const croppedAreaPercentages = {
    x: (croppedAreaPixels.x / mediaNaturalBBoxSize.width) * 100,
    y: (croppedAreaPixels.y / mediaNaturalBBoxSize.height) * 100,
    width: (croppedAreaPixels.width / mediaNaturalBBoxSize.width) * 100,
    height: (croppedAreaPixels.height / mediaNaturalBBoxSize.height) * 100,
  }

  return getInitialCropFromCroppedAreaPercentages({
    croppedAreaPercentages,
    mediaSize,
    rotation,
    cropSize,
    minZoom,
    maxZoom,
  })
}

function validateInitialCropInputs(
  { mediaSize, rotation = 0, cropSize, minZoom = 1, maxZoom = 3 }: InitialCropGeometryOptions,
  area: CropArea,
): void {
  validatePositiveFiniteSize(mediaSize, 'media size')
  validatePositiveFiniteSize(cropSize, 'crop size')
  validatePositiveFiniteSize(
    { width: mediaSize.naturalWidth, height: mediaSize.naturalHeight },
    'natural media size',
  )
  assertFiniteNumber(rotation, 'rotation')
  validateCropArea(area, 'cropped area')
  validatePositiveFiniteNumber(minZoom, 'minZoom')
  validatePositiveFiniteNumber(maxZoom, 'maxZoom')
  if (minZoom > maxZoom) {
    throw new RangeError('minZoom must be less than or equal to maxZoom')
  }
}

function validateCropArea(area: CropArea, name: string): void {
  assertFiniteNumber(area.x, `${name}.x`)
  assertFiniteNumber(area.y, `${name}.y`)
  validatePositiveFiniteNumber(area.width, `${name}.width`)
  validatePositiveFiniteNumber(area.height, `${name}.height`)
}

function validatePositiveFiniteSize(size: Size, name: string): void {
  validatePositiveFiniteNumber(size.width, `${name}.width`)
  validatePositiveFiniteNumber(size.height, `${name}.height`)
}

function validatePositiveFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`)
  }
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`)
  }
}

/**
 * Ensure the returned value is between 0 and max
 * @param max
 * @param value
 * @param shouldRound
 */
function limitArea(max: number, value: number, shouldRound = false): number {
  const v = shouldRound ? Math.round(value) : value
  return Math.min(max, Math.max(0, v))
}

function noOp(_max: number, value: number): number {
  return value
}

/**
 * Return the point that is the center of point a and b
 * @param a
 * @param b
 */
export function getCenter(a: Point, b: Point): Point {
  return {
    x: (b.x + a.x) / 2,
    y: (b.y + a.y) / 2,
  }
}

export function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180
}

/**
 * Returns the new bounding area of a rotated rectangle.
 */
export function rotateSize(width: number, height: number, rotation: number): Size {
  const rotRad = getRadianAngle(rotation)

  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
