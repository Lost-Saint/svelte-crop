import type { HTMLImgAttributes } from 'svelte/elements'

export type CropShape = 'rect' | 'round'

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

/** Shared geometry options for restoring a crop from a previously saved area. */
export interface InitialCropGeometryOptions {
  mediaSize: MediaSize
  rotation?: number
  cropSize: Size
  minZoom?: number
  maxZoom?: number
}

export interface InitialCropFromPercentagesOptions extends InitialCropGeometryOptions {
  croppedAreaPercentages: CropArea
}

export interface InitialCropFromPixelsOptions extends InitialCropGeometryOptions {
  croppedAreaPixels: CropArea
}

export interface InitialCrop {
  crop: Point
  zoom: number
}

export interface OnCropCompleteEvent {
  percent: CropArea
  pixels: CropArea
}

export type OnCropComplete = (event: OnCropCompleteEvent) => void
export type OnCropAreaChange = (event: OnCropCompleteEvent) => void

export interface CropperOptions {
  crop?: Point
  zoom?: number
  rotation?: number
  aspect?: number
  minZoom?: number
  maxZoom?: number
  /** Preferred restoration area. Takes precedence over `initialCroppedAreaPixels`. */
  initialCroppedAreaPercentages?: CropArea
  /** Restoration area in pixels; ignored when `initialCroppedAreaPercentages` is set. */
  initialCroppedAreaPixels?: CropArea
  /** Crop position adjustment in pixels for each arrow key press. */
  keyboardStep?: number
  cropSize?: Size | null
  cropShape?: CropShape
  showGrid?: boolean
  zoomSpeed?: number
  crossOrigin?: HTMLImgAttributes['crossorigin']
  restrictPosition?: boolean
  tabindex?: number
  oncropcomplete?: OnCropComplete
  /**
   * Same payload as `oncropcomplete`, but fired live on every crop, zoom or
   * rotation change instead of only when an interaction settles.
   * Like `oncropcomplete`, never write `crop`/`zoom`/`rotation` back
   * synchronously from this callback (infinite loop).
   */
  oncropareachange?: OnCropAreaChange
}

/** Provide exactly one media source. */
export type Props = CropperOptions &
  ({ image: string; video?: never } | { image?: never; video: string | VideoSrc[] })

export interface VideoSrc {
  src: string
  type?: string
}

/** Back-compat alias — prefer `Props` in new code. */
export type CropperProps = Props

export interface Size {
  width: number
  height: number
}

export interface MediaSize extends Size {
  naturalWidth: number
  naturalHeight: number
}

/** @deprecated Prefer `MediaSize`; the cropper also supports video. */
export type ImageSize = MediaSize

export interface Point {
  x: number
  y: number
}
