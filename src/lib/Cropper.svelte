<script lang="ts">
	import type { Attachment } from 'svelte/attachments'
	import { on } from 'svelte/events'
	import * as helpers from './helpers.js'
	import type { ImageSize, Props } from './types.js'

	// Only crop/zoom are $bindable: they are the only props reassigned
	// inside this component. Everything else is read-only input.
	let {
		image,
		crop = $bindable({ x: 0, y: 0 }),
		zoom = $bindable(1),
		minZoom = 1,
		maxZoom = 3,
		aspect = 4 / 3,
		cropSize = null,
		cropShape = 'rect',
		showGrid = true,
		zoomSpeed = 1,
		crossOrigin = null,
		restrictPosition = true,
		tabindex = undefined,
		oncropcomplete,
	}: Props = $props()

	let imageSize = $state.raw<ImageSize | null>(null)
	// Derived from props + imageSize — re-evaluates automatically, no $effect needed.
	let cropperSize = $derived.by(() => {
		if (!imageSize) return null
		return cropSize ?? helpers.getCropSize(imageSize.width, imageSize.height, aspect)
	})
	let aspectValue = $derived(cropSize ? cropSize.width / cropSize.height : aspect)
	let transform = $derived(`translate(${crop.x}px, ${crop.y}px) scale(${zoom})`)

	let containerEl: HTMLDivElement | undefined
	let imgEl: HTMLImageElement | undefined
	// Plain (non-reactive) by design: only read inside event handlers,
	// never in the template or a $derived — so no $state needed.
	let containerRect: DOMRect | null = null
	let dragStartPosition = { x: 0, y: 0 }
	let dragStartCrop = { x: 0, y: 0 }
	let lastPinchDistance = 0
	let dragFrame: number | undefined
	let zoomFrame: number | undefined
	let cleanDocumentListeners = (): void => {}

	// this is to prevent Safari on iOS >= 10 to zoom the page
	const preventZoomSafari = (e: Event): void => e.preventDefault()

	const cleanDragListeners = (): void => {
		const cleanup = cleanDocumentListeners
		cleanDocumentListeners = () => {}
		cleanup()
	}

	const listenForDragEvents = (cleanups: Array<() => void>): void => {
		cleanDragListeners()
		cleanDocumentListeners = () => cleanups.forEach(cleanup => cleanup())
	}

	const cancelPendingFrames = (): void => {
		if (dragFrame !== undefined) {
			window.cancelAnimationFrame(dragFrame)
			dragFrame = undefined
		}
		if (zoomFrame !== undefined) {
			window.cancelAnimationFrame(zoomFrame)
			zoomFrame = undefined
		}
	}

	const onImgLoad = (): void => {
		computeSizes()
		emitCropData()
	}

	const computeSizes = (): void => {
		if (imgEl && imgEl.naturalWidth > 0) {
			imageSize = {
				width: imgEl.width,
				height: imgEl.height,
				naturalWidth: imgEl.naturalWidth,
				naturalHeight: imgEl.naturalHeight,
			}
		}
		if (containerEl) {
			containerRect = containerEl.getBoundingClientRect()
		}
	}

	const getMousePoint = (e: MouseEvent): { x: number; y: number } => ({
		x: e.clientX,
		y: e.clientY,
	})

	const getTouchPoint = (touch: Touch): { x: number; y: number } => ({
		x: touch.clientX,
		y: touch.clientY,
	})

	const onMouseDown = (e: MouseEvent): void => {
		e.preventDefault()
		listenForDragEvents([
			on(document, 'mousemove', onMouseMove),
			on(document, 'mouseup', onDragStopped),
		])
		onDragStart(getMousePoint(e))
	}

	const onMouseMove = (e: MouseEvent): void => onDrag(getMousePoint(e))

	const onTouchStart = (e: TouchEvent): void => {
		e.preventDefault()
		listenForDragEvents([
			on(document, 'touchmove', onTouchMove, { passive: false }), // iOS 11 now defaults to passive: true
			on(document, 'touchend', onDragStopped),
		])

		if (e.touches.length === 2) {
			onPinchStart(e)
		} else if (e.touches.length === 1) {
			const touch = e.touches.item(0)
			if (touch) onDragStart(getTouchPoint(touch))
		}
	}

	const onTouchMove = (e: TouchEvent): void => {
		// Prevent whole page from scrolling on iOS.
		e.preventDefault()
		if (e.touches.length === 2) {
			onPinchMove(e)
		} else if (e.touches.length === 1) {
			const touch = e.touches.item(0)
			if (touch) onDrag(getTouchPoint(touch))
		}
	}

	const onDragStart = ({ x, y }: { x: number; y: number }): void => {
		dragStartPosition = { x, y }
		dragStartCrop = { x: crop.x, y: crop.y }
	}

	const onDrag = ({ x, y }: { x: number; y: number }): void => {
		if (dragFrame !== undefined) window.cancelAnimationFrame(dragFrame)

		dragFrame = window.requestAnimationFrame(() => {
			dragFrame = undefined
			if (!imageSize || !cropperSize) return
			const offsetX = x - dragStartPosition.x
			const offsetY = y - dragStartPosition.y
			const requestedPosition = {
				x: dragStartCrop.x + offsetX,
				y: dragStartCrop.y + offsetY,
			}

			crop = restrictPosition
				? helpers.restrictPosition(requestedPosition, imageSize, cropperSize, zoom)
				: requestedPosition
		})
	}

	const onDragStopped = (): void => {
		cleanDragListeners()
		emitCropData()
	}

	const onPinchStart = (e: TouchEvent): void => {
		const touchA = e.touches.item(0)
		const touchB = e.touches.item(1)
		if (!touchA || !touchB) return

		const pointA = getTouchPoint(touchA)
		const pointB = getTouchPoint(touchB)
		lastPinchDistance = helpers.getDistanceBetweenPoints(pointA, pointB)
		onDragStart(helpers.getCenter(pointA, pointB))
	}

	const onPinchMove = (e: TouchEvent): void => {
		const touchA = e.touches.item(0)
		const touchB = e.touches.item(1)
		if (!touchA || !touchB) return

		const pointA = getTouchPoint(touchA)
		const pointB = getTouchPoint(touchB)
		const center = helpers.getCenter(pointA, pointB)
		onDrag(center)

		if (zoomFrame !== undefined) window.cancelAnimationFrame(zoomFrame)
		zoomFrame = window.requestAnimationFrame(() => {
			zoomFrame = undefined
			const distance = helpers.getDistanceBetweenPoints(pointA, pointB)
			const newZoom = zoom * (distance / lastPinchDistance)
			setNewZoom(newZoom, center)
			lastPinchDistance = distance
		})
	}

	const onWheel = (e: WheelEvent): void => {
		e.preventDefault()
		const point = getMousePoint(e)
		const newZoom = zoom - (e.deltaY * zoomSpeed) / 200
		setNewZoom(newZoom, point)
	}

	const getPointOnContainer = (
		{ x, y }: { x: number; y: number },
	): { x: number; y: number } | null => {
		if (!containerRect) return null
		return {
			x: containerRect.width / 2 - (x - containerRect.left),
			y: containerRect.height / 2 - (y - containerRect.top),
		}
	}

	const getPointOnImage = ({ x, y }: { x: number; y: number }): { x: number; y: number } => ({
		x: (x + crop.x) / zoom,
		y: (y + crop.y) / zoom,
	})

	const setNewZoom = (newZoom: number, point: { x: number; y: number }): void => {
		if (!imageSize || !cropperSize) return
		const zoomPoint = getPointOnContainer(point)
		if (!zoomPoint) return
		const zoomTarget = getPointOnImage(zoomPoint)
		zoom = Math.min(maxZoom, Math.max(newZoom, minZoom))

		const requestedPosition = {
			x: zoomTarget.x * zoom - zoomPoint.x,
			y: zoomTarget.y * zoom - zoomPoint.y,
		}
		crop = restrictPosition
			? helpers.restrictPosition(requestedPosition, imageSize, cropperSize, zoom)
			: requestedPosition
	}

	const emitCropData = (): void => {
		if (!imageSize || !cropperSize || cropperSize.width === 0) return
		// this is to ensure the crop is correctly restricted after a zoom back (https://github.com/ricardo-ch/svelte-easy-crop/issues/6)
		const position = restrictPosition
			? helpers.restrictPosition(crop, imageSize, cropperSize, zoom)
			: crop
		const { croppedAreaPercentages, croppedAreaPixels } = helpers.computeCroppedArea(
			position,
			imageSize,
			cropperSize,
			aspectValue,
			zoom,
			restrictPosition,
		)

		oncropcomplete?.({
			percent: croppedAreaPercentages,
			pixels: croppedAreaPixels,
		})
	}

	// Notify the parent whenever the visible crop changes. This $effect
	// tracks crop/zoom/imageSize/cropperSize via emitCropData — it only
	// notifies, it never writes state, so no cycle. Effects never run on
	// the server, so no browser guard is needed.
	$effect(() => {
		if (imageSize && cropperSize) {
			emitCropData()
		}
	})

	// Cached images may already be complete before onload can fire.
	// $effect runs after mount on the client — the Svelte 5 successor to onMount.
	$effect(() => {
		if (imgEl?.complete) {
			onImgLoad()
		}
	})

	const attachContainer: Attachment<HTMLDivElement> = node => {
		const cleanups = [
			on(node, 'touchstart', onTouchStart),
			on(node, 'mousedown', onMouseDown),
			on(node, 'wheel', onWheel, { passive: false }),
			on(node, 'gesturestart', preventZoomSafari),
			on(node, 'gesturechange', preventZoomSafari),
		]

		return () => {
			cleanups.forEach(cleanup => cleanup())
			cleanDragListeners()
			cancelPendingFrames()
		}
	}
</script>

<svelte:window onresize={computeSizes} />
<div
	class="svelte-easy-crop-container"
	bind:this={containerEl}
	{@attach attachContainer}
	{tabindex}
	role="button"
	data-testid="container"
>
	<img
		bind:this={imgEl}
		class="svelte-easy-crop-image"
		src={image}
		onload={onImgLoad}
		alt=""
		style:transform={transform}
		crossorigin={crossOrigin}
	/>
	{#if cropperSize}
		<div
			class={[
				'svelte-easy-crop-area',
				cropShape === 'round' && 'svelte-easy-crop-round',
				showGrid && 'svelte-easy-crop-grid',
			]}
			style:width={`${cropperSize.width}px`}
			style:height={`${cropperSize.height}px`}
			data-testid="cropper"
		>
		</div>
	{/if}
</div>

<style>
.svelte-easy-crop-container {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	overflow: hidden;
	user-select: none;
	touch-action: none;
	cursor: move;
}

.svelte-easy-crop-image {
	max-width: 100%;
	max-height: 100%;
	margin: auto;
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	will-change: transform;
}

.svelte-easy-crop-area {
	position: absolute;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	box-shadow: 0 0 0 9999em;
	box-sizing: border-box;
	color: rgba(0, 0, 0, 0.5);
	border: 1px solid rgba(255, 255, 255, 0.5);
	overflow: hidden;
}

.svelte-easy-crop-grid:before {
	content: " ";
	box-sizing: border-box;
	border: 1px solid rgba(255, 255, 255, 0.5);
	position: absolute;
	top: 0;
	bottom: 0;
	left: 33.33%;
	right: 33.33%;
	border-top: 0;
	border-bottom: 0;
}

.svelte-easy-crop-grid:after {
	content: " ";
	box-sizing: border-box;
	border: 1px solid rgba(255, 255, 255, 0.5);
	position: absolute;
	top: 33.33%;
	bottom: 33.33%;
	left: 0;
	right: 0;
	border-left: 0;
	border-right: 0;
}

.svelte-easy-crop-round {
	border-radius: 50%;
}
</style>
