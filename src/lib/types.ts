import type { HTMLImgAttributes } from 'svelte/elements'

export type CropShape = 'rect' | 'round'

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

export interface OnCropCompleteEvent {
  percent: CropArea
  pixels: CropArea
}

export type OnCropComplete = (event: OnCropCompleteEvent) => void

export interface Props {
  image: string
  crop?: Point
  zoom?: number
  aspect?: number
  minZoom?: number
  maxZoom?: number
  cropSize?: Size | null
  cropShape?: CropShape
  showGrid?: boolean
  zoomSpeed?: number
  crossOrigin?: HTMLImgAttributes['crossorigin']
  restrictPosition?: boolean
  tabindex?: number
  oncropcomplete?: OnCropComplete
}

/** Back-compat alias — prefer `Props` in new code. */
export type CropperProps = Props

export interface Size {
  width: number
  height: number
}

export interface ImageSize extends Size {
  naturalWidth: number
  naturalHeight: number
}

export interface Point {
  x: number
  y: number
}
