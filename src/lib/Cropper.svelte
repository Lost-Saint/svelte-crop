<script lang="ts">
	import { onMount } from 'svelte'
	import type { Attachment } from 'svelte/attachments'
	import { on } from 'svelte/events'
	import * as helpers from './helpers.js'
	import type { MediaSize, OnCropCompleteEvent, Props, VideoSrc } from './types.js'

	// crop, zoom, and rotation are bindable because interactions update them.
	let {
		image,
		video,
		crop = $bindable({ x: 0, y: 0 }),
		zoom = $bindable(1),
		rotation = $bindable(0),
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
		oncropareachange,
	}: Props = $props()

	let mediaSize = $state.raw<MediaSize | null>(null)
	let containerRect = $state.raw<DOMRect | null>(null)
	// Derived from props + measured media/container sizes.
	let cropperSize = $derived.by(() => {
		if (!mediaSize || !containerRect) return null
		return (
			cropSize
				?? helpers.getCropSize(
					mediaSize.width,
					mediaSize.height,
					containerRect.width,
					containerRect.height,
					aspect,
					rotation,
				)
		)
	})
	let aspectValue = $derived(cropSize ? cropSize.width / cropSize.height : aspect)
	let transform = $derived(
		`translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${zoom})`,
	)
	let videoSources = $derived<VideoSrc[]>(
		video === undefined ? [] : typeof video === 'string' ? [{ src: video }] : video,
	)

	let containerEl: HTMLDivElement | undefined
	let imgEl = $state<HTMLImageElement>()
	let videoEl = $state<HTMLVideoElement>()
	// Plain (non-reactive) by design: only read inside event handlers,
	// never in the template or a $derived — so no $state needed.
	let dragStartPosition = { x: 0, y: 0 }
	let dragStartCrop = { x: 0, y: 0 }
	let lastPinchDistance = 0
	let dragFrame: number | undefined
	let zoomFrame: number | undefined
	let completeFrame: number | undefined
	let wheelTimer: number | undefined
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
		if (completeFrame !== undefined) {
			window.cancelAnimationFrame(completeFrame)
			completeFrame = undefined
		}
		if (wheelTimer !== undefined) {
			window.clearTimeout(wheelTimer)
			wheelTimer = undefined
		}
	}

	const onMediaLoad = (): void => {
		computeSizes()
		emitCropComplete()
	}

	const computeSizes = (): void => {
		if (containerEl) {
			containerRect = containerEl.getBoundingClientRect()
		}
		if (!containerRect || containerRect.width === 0 || containerRect.height === 0) return

		const naturalWidth = video !== undefined
			? (videoEl?.videoWidth ?? 0)
			: (imgEl?.naturalWidth ?? 0)
		const naturalHeight = video !== undefined
			? (videoEl?.videoHeight ?? 0)
			: (imgEl?.naturalHeight ?? 0)
		if (naturalWidth === 0 || naturalHeight === 0) {
			mediaSize = null
			return
		}

		const scale = Math.min(
			1,
			containerRect.width / naturalWidth,
			containerRect.height / naturalHeight,
		)
		mediaSize = {
			// Replaced media elements expose integer layout dimensions. Keeping
			// crop math on those same pixel bounds preserves drag/zoom limits.
			width: Math.round(naturalWidth * scale),
			height: Math.round(naturalHeight * scale),
			naturalWidth,
			naturalHeight,
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
			if (!mediaSize || !cropperSize) return
			const offsetX = x - dragStartPosition.x
			const offsetY = y - dragStartPosition.y
			const requestedPosition = {
				x: dragStartCrop.x + offsetX,
				y: dragStartCrop.y + offsetY,
			}

			crop = restrictPosition
				? helpers.restrictPosition(
					requestedPosition,
					mediaSize,
					cropperSize,
					zoom,
					rotation,
				)
				: requestedPosition
		})
	}

	const onDragStopped = (): void => {
		cleanDragListeners()
		if (completeFrame !== undefined) window.cancelAnimationFrame(completeFrame)
		// Let the last queued drag/pinch frame update the bound state first.
		completeFrame = window.requestAnimationFrame(() => {
			completeFrame = undefined
			emitCropComplete()
		})
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
		if (wheelTimer !== undefined) window.clearTimeout(wheelTimer)
		wheelTimer = window.setTimeout(() => {
			wheelTimer = undefined
			emitCropComplete()
		}, 250)
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

	const getPointOnImage = ({ x, y }: { x: number; y: number }): { x: number; y: number } =>
		helpers.rotatePoint({ x: (x + crop.x) / zoom, y: (y + crop.y) / zoom }, -rotation)

	const setNewZoom = (newZoom: number, point: { x: number; y: number }): void => {
		if (!mediaSize || !cropperSize) return
		const zoomPoint = getPointOnContainer(point)
		if (!zoomPoint) return
		const zoomTarget = getPointOnImage(zoomPoint)
		zoom = Math.min(maxZoom, Math.max(newZoom, minZoom))

		const rotatedTarget = helpers.rotatePoint({
			x: zoomTarget.x * zoom,
			y: zoomTarget.y * zoom,
		}, rotation)
		const requestedPosition = {
			x: rotatedTarget.x - zoomPoint.x,
			y: rotatedTarget.y - zoomPoint.y,
		}
		crop = restrictPosition
			? helpers.restrictPosition(requestedPosition, mediaSize, cropperSize, zoom, rotation)
			: requestedPosition
	}

	const getCropData = (): OnCropCompleteEvent | null => {
		if (!mediaSize || !cropperSize || cropperSize.width === 0) return null
		// this is to ensure the crop is correctly restricted after a zoom back (https://github.com/ricardo-ch/svelte-easy-crop/issues/6)
		const position = restrictPosition
			? helpers.restrictPosition(crop, mediaSize, cropperSize, zoom, rotation)
			: crop
		const { croppedAreaPercentages, croppedAreaPixels } = helpers.computeCroppedArea(
			position,
			mediaSize,
			cropperSize,
			aspectValue,
			zoom,
			rotation,
			restrictPosition,
		)

		return {
			percent: croppedAreaPercentages,
			pixels: croppedAreaPixels,
		}
	}

	const emitCropComplete = (): void => {
		const cropData = getCropData()
		if (cropData) oncropcomplete?.(cropData)
	}

	// Live updates follow every change to crop, zoom, rotation, or measured size.
	$effect(() => {
		const cropData = getCropData()
		if (cropData) oncropareachange?.(cropData)
	})

	// Cached images and videos can finish loading before their load handler is attached.
	onMount(() => {
		if (videoEl && videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) onMediaLoad()
		else if (imgEl?.complete && imgEl.naturalWidth > 0) onMediaLoad()
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
	{#if video !== undefined}
		<video
			bind:this={videoEl}
			class="svelte-easy-crop-video"
			data-testid="video"
			autoplay
			playsinline
			loop
			muted
			controls={false}
			preload="metadata"
			onloadedmetadata={onMediaLoad}
			style:transform={transform}
			crossorigin={crossOrigin}
		>
			{#each videoSources as source (source.src)}
				<source src={source.src} type={source.type} />
			{/each}
		</video>
	{:else}
		<img
			bind:this={imgEl}
			class="svelte-easy-crop-image"
			data-testid="image"
			src={image}
			onload={onMediaLoad}
			alt=""
			style:transform={transform}
			crossorigin={crossOrigin}
		/>
	{/if}
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

.svelte-easy-crop-image,
.svelte-easy-crop-video {
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
