<script lang="ts">
	import { onMount, untrack } from 'svelte'
	import type { Attachment } from 'svelte/attachments'
	import { on } from 'svelte/events'
	import * as helpers from './helpers.js'
	import type { CropArea, MediaSize, OnCropCompleteEvent, Props, VideoSrc } from './types.js'

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
		initialCroppedAreaPercentages,
		initialCroppedAreaPixels,
		keyboardStep = 1,
		tabindex = 0,
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
	type PinchGesture = {
		touchIds: [number, number]
		lastDistance: number
		lastAngle: number
		lastCenter: { x: number; y: number }
	}
	type SafariGesture =
		| { kind: 'inactive' }
		| {
			kind: 'active'
			startZoom: number
			startRotation: number
			startScale: number
			startEventRotation: number
			imagePoint: { x: number; y: number }
		}
	let pinchGesture: PinchGesture | null = null
	let safariGesture: SafariGesture = { kind: 'inactive' }
	let touchGestureActive = false
	let keyboardInteractionActive = false
	let keyboardInteractionChanged = false
	let dragFrame: number | undefined
	let pendingDragUpdate: (() => void) | null = null
	let zoomFrame: number | undefined
	let pendingPinchUpdate: (() => void) | null = null
	let completeFrame: number | undefined
	let wheelTimer: number | undefined
	let cleanDocumentListeners = (): void => {}
	let mediaReadyForSource = false
	let initialCropAppliedForLoad = false
	let currentMediaSourceKey = getMediaSourceKey()
	let lastValidAreaPercentages: CropArea | null = null

	function getMediaSourceKey(): string {
		return video !== undefined
			? JSON.stringify(['video', videoSources.map(({ src, type }) => [src, type])]) ?? ''
			: JSON.stringify(['image', image]) ?? ''
	}

	const resetMediaLoad = (): void => {
		mediaReadyForSource = false
		initialCropAppliedForLoad = false
		mediaSize = null
		lastValidAreaPercentages = null
	}

	const syncMediaSource = (): void => {
		const nextKey = getMediaSourceKey()
		if (nextKey === currentMediaSourceKey) return
		currentMediaSourceKey = nextKey
		resetMediaLoad()
	}

	$effect(() => {
		const nextKey = getMediaSourceKey()
		if (nextKey !== currentMediaSourceKey) {
			currentMediaSourceKey = nextKey
			resetMediaLoad()
		}
	})

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
		pendingDragUpdate = null
		if (zoomFrame !== undefined) {
			window.cancelAnimationFrame(zoomFrame)
			zoomFrame = undefined
		}
		pendingPinchUpdate = null
		if (completeFrame !== undefined) {
			window.cancelAnimationFrame(completeFrame)
			completeFrame = undefined
		}
		if (wheelTimer !== undefined) {
			window.clearTimeout(wheelTimer)
			wheelTimer = undefined
		}
	}

	const getCropSizeFor = (
		nextMediaSize: MediaSize,
		nextContainerRect: DOMRect,
		nextRotation = rotation,
	): { width: number; height: number } =>
		cropSize ?? helpers.getCropSize(
			nextMediaSize.width,
			nextMediaSize.height,
			nextContainerRect.width,
			nextContainerRect.height,
			aspect,
			nextRotation,
		)

	const hasPositiveSize = (size: { width: number; height: number }): boolean =>
		Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height)
		&& size.height > 0

	const applyInitialCrop = (
		nextMediaSize: MediaSize,
		nextCropSize: { width: number; height: number },
	): void => {
		if (initialCroppedAreaPercentages) {
			const restored = helpers.getInitialCropFromCroppedAreaPercentages({
				croppedAreaPercentages: initialCroppedAreaPercentages,
				mediaSize: nextMediaSize,
				rotation,
				cropSize: nextCropSize,
				minZoom,
				maxZoom,
			})
			zoom = restored.zoom
			crop = restrictPosition
				? helpers.restrictPosition(
					restored.crop,
					nextMediaSize,
					nextCropSize,
					restored.zoom,
					rotation,
				)
				: restored.crop
		} else if (initialCroppedAreaPixels) {
			const restored = helpers.getInitialCropFromCroppedAreaPixels({
				croppedAreaPixels: initialCroppedAreaPixels,
				mediaSize: nextMediaSize,
				rotation,
				cropSize: nextCropSize,
				minZoom,
				maxZoom,
			})
			zoom = restored.zoom
			crop = restrictPosition
				? helpers.restrictPosition(
					restored.crop,
					nextMediaSize,
					nextCropSize,
					restored.zoom,
					rotation,
				)
				: restored.crop
		}
	}

	const onMediaLoadStart = (): void => {
		syncMediaSource()
		resetMediaLoad()
	}

	const onMediaLoad = (): void => {
		syncMediaSource()
		if (mediaReadyForSource && initialCropAppliedForLoad) return
		mediaReadyForSource = true
		computeSizes()
	}

	const computeSizes = (): void => {
		syncMediaSource()
		const measuredRect = containerEl?.getBoundingClientRect()
		if (!measuredRect) return

		const previousMediaSize = mediaSize
		const previousCropSize = previousMediaSize && containerRect
			? getCropSizeFor(previousMediaSize, containerRect)
			: null
		const currentArea =
			previousMediaSize && previousCropSize && hasPositiveSize(previousCropSize)
				? getCropData()?.percent
				: undefined
		if (currentArea && hasPositiveSize(currentArea)) lastValidAreaPercentages = currentArea
		const previousArea = currentArea && hasPositiveSize(currentArea)
			? currentArea
			: lastValidAreaPercentages ?? undefined
		const containerSizeChanged = !containerRect
			|| containerRect.width !== measuredRect.width
			|| containerRect.height !== measuredRect.height
		if (containerSizeChanged) containerRect = measuredRect
		if (measuredRect.width <= 0 || measuredRect.height <= 0) return

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
			measuredRect.width / naturalWidth,
			measuredRect.height / naturalHeight,
		)
		const nextMediaSize: MediaSize = {
			// Replaced media elements expose integer layout dimensions. Keeping
			// crop math on those same pixel bounds preserves drag/zoom limits.
			width: Math.round(naturalWidth * scale),
			height: Math.round(naturalHeight * scale),
			naturalWidth,
			naturalHeight,
		}
		if (!hasPositiveSize(nextMediaSize)) return
		const nextCropSize = getCropSizeFor(nextMediaSize, measuredRect)
		if (!hasPositiveSize(nextCropSize)) return

		const mediaSizeChanged = !previousMediaSize
			|| previousMediaSize.width !== nextMediaSize.width
			|| previousMediaSize.height !== nextMediaSize.height
			|| previousMediaSize.naturalWidth !== nextMediaSize.naturalWidth
			|| previousMediaSize.naturalHeight !== nextMediaSize.naturalHeight
		const cropSizeChanged = !previousCropSize
			|| previousCropSize.width !== nextCropSize.width
			|| previousCropSize.height !== nextCropSize.height
		const geometryChanged = mediaSizeChanged || cropSizeChanged
		mediaSize = nextMediaSize

		if (mediaReadyForSource && !initialCropAppliedForLoad) {
			applyInitialCrop(nextMediaSize, nextCropSize)
			initialCropAppliedForLoad = true
			lastValidAreaPercentages = getCropData()?.percent ?? null
			emitCropComplete()
			return
		}

		if (initialCropAppliedForLoad && geometryChanged) {
			if (previousArea && hasPositiveSize(previousArea)) {
				const restored = helpers.getInitialCropFromCroppedAreaPercentages({
					croppedAreaPercentages: previousArea,
					mediaSize: nextMediaSize,
					rotation,
					cropSize: nextCropSize,
					minZoom,
					maxZoom,
				})
				zoom = restored.zoom
				crop = restrictPosition
					? helpers.restrictPosition(
						restored.crop,
						nextMediaSize,
						nextCropSize,
						restored.zoom,
						rotation,
					)
					: restored.crop
				lastValidAreaPercentages = previousArea
			} else if (restrictPosition) {
				crop = helpers.restrictPosition(crop, nextMediaSize, nextCropSize, zoom, rotation)
			}
			scheduleDebouncedCropComplete()
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

	const flushPinchUpdate = (): void => {
		if (zoomFrame !== undefined) {
			window.cancelAnimationFrame(zoomFrame)
			zoomFrame = undefined
		}
		const update = pendingPinchUpdate
		pendingPinchUpdate = null
		update?.()
	}

	const flushDragUpdate = (): void => {
		if (dragFrame !== undefined) {
			window.cancelAnimationFrame(dragFrame)
			dragFrame = undefined
		}
		const update = pendingDragUpdate
		pendingDragUpdate = null
		update?.()
	}

	const onMouseDown = (e: MouseEvent): void => {
		computeSizes()
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
		computeSizes()
		touchGestureActive = true
		safariGesture = { kind: 'inactive' }
		listenForDragEvents([
			on(document, 'touchmove', onTouchMove, { passive: false }), // iOS 11 now defaults to passive: true
			on(document, 'touchend', onTouchEnd),
			on(document, 'touchcancel', onTouchEnd),
		])

		if (e.touches.length >= 2) {
			onPinchStart(e)
		} else if (e.touches.length === 1) {
			const touch = e.touches.item(0)
			if (touch) onDragStart(getTouchPoint(touch))
		}
	}

	const onTouchMove = (e: TouchEvent): void => {
		// Prevent whole page from scrolling on iOS.
		e.preventDefault()
		if (e.touches.length >= 2) {
			onPinchMove(e)
		} else if (e.touches.length === 1) {
			if (pinchGesture) {
				flushPinchUpdate()
				pinchGesture = null
				const touch = e.touches.item(0)
				if (touch) onDragStart(getTouchPoint(touch))
			}
			const touch = e.touches.item(0)
			if (touch) onDrag(getTouchPoint(touch))
		}
	}

	const onTouchEnd = (e: TouchEvent): void => {
		if (e.touches.length >= 2) {
			onPinchStart(e)
			return
		}
		if (e.touches.length === 1) {
			flushPinchUpdate()
			pinchGesture = null
			const touch = e.touches.item(0)
			if (touch) onDragStart(getTouchPoint(touch))
			return
		}

		flushPinchUpdate()
		pinchGesture = null
		touchGestureActive = false
		cleanDragListeners()
		onDragStopped()
	}

	const onDragStart = ({ x, y }: { x: number; y: number }): void => {
		dragStartPosition = { x, y }
		dragStartCrop = { x: crop.x, y: crop.y }
	}

	const onDrag = ({ x, y }: { x: number; y: number }): void => {
		if (dragFrame !== undefined) window.cancelAnimationFrame(dragFrame)

		pendingDragUpdate = () => {
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
		}
		dragFrame = window.requestAnimationFrame(() => {
			const update = pendingDragUpdate
			pendingDragUpdate = null
			update?.()
		})
	}

	const onDragStopped = (): void => {
		cleanDragListeners()
		scheduleCropComplete()
	}

	const scheduleCropComplete = (): void => {
		if (completeFrame !== undefined) window.cancelAnimationFrame(completeFrame)
		// Let the last queued interaction frame update the bound state first.
		completeFrame = window.requestAnimationFrame(() => {
			completeFrame = undefined
			emitCropComplete()
		})
	}

	const onPinchStart = (e: TouchEvent): void => {
		flushDragUpdate()
		flushPinchUpdate()
		const touchA = e.touches.item(0)
		const touchB = e.touches.item(1)
		if (!touchA || !touchB) return

		const pointA = getTouchPoint(touchA)
		const pointB = getTouchPoint(touchB)
		const center = helpers.getCenter(pointA, pointB)
		pinchGesture = {
			touchIds: [touchA.identifier, touchB.identifier],
			lastDistance: helpers.getDistanceBetweenPoints(pointA, pointB),
			lastAngle: helpers.getRotationBetweenPoints(pointA, pointB),
			lastCenter: center,
		}
	}

	const onPinchMove = (e: TouchEvent): void => {
		const gesture = pinchGesture
		if (!gesture) {
			onPinchStart(e)
			return
		}
		const touchA = findTouch(e.touches, gesture.touchIds[0])
		const touchB = findTouch(e.touches, gesture.touchIds[1])
		if (!touchA || !touchB) return

		const pointA = getTouchPoint(touchA)
		const pointB = getTouchPoint(touchB)
		const center = helpers.getCenter(pointA, pointB)
		const distance = helpers.getDistanceBetweenPoints(pointA, pointB)
		const angle = helpers.getRotationBetweenPoints(pointA, pointB)

		if (zoomFrame !== undefined) window.cancelAnimationFrame(zoomFrame)
		const activeGesture = gesture
		pendingPinchUpdate = () => {
			if (pinchGesture !== activeGesture) return
			const centerOffset = {
				x: center.x - activeGesture.lastCenter.x,
				y: center.y - activeGesture.lastCenter.y,
			}
			if (mediaSize && cropperSize && (centerOffset.x !== 0 || centerOffset.y !== 0)) {
				const requestedPosition = {
					x: crop.x + centerOffset.x,
					y: crop.y + centerOffset.y,
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
			}
			activeGesture.lastCenter = center
			if (distance === 0) {
				activeGesture.lastDistance = 0
				return
			}
			if (activeGesture.lastDistance === 0) {
				activeGesture.lastDistance = distance
				activeGesture.lastAngle = angle
				return
			}

			const angleDelta = ((angle - activeGesture.lastAngle + 540) % 360) - 180
			const newZoom = zoom * (distance / activeGesture.lastDistance)
			setNewTransform(newZoom, rotation + angleDelta, center)
			activeGesture.lastDistance = distance
			activeGesture.lastAngle = angle
		}
		zoomFrame = window.requestAnimationFrame(() => {
			zoomFrame = undefined
			const update = pendingPinchUpdate
			pendingPinchUpdate = null
			update?.()
		})
	}

	const findTouch = (touches: TouchList, identifier: number): Touch | undefined => {
		for (let index = 0; index < touches.length; index += 1) {
			const touch = touches.item(index)
			if (touch?.identifier === identifier) return touch
		}
		return undefined
	}

	const onWheel = (e: WheelEvent): void => {
		computeSizes()
		e.preventDefault()
		const point = getMousePoint(e)
		const newZoom = zoom - (e.deltaY * zoomSpeed) / 200
		setNewTransform(newZoom, rotation, point)
		scheduleDebouncedCropComplete()
	}

	const getPointOnContainer = (
		{ x, y }: { x: number; y: number },
	): { x: number; y: number } | null => {
		const rect = containerEl?.getBoundingClientRect()
		if (!rect) return null
		return {
			x: rect.width / 2 - (x - rect.left),
			y: rect.height / 2 - (y - rect.top),
		}
	}

	const getPointOnImage = ({ x, y }: { x: number; y: number }): { x: number; y: number } =>
		helpers.rotatePoint({ x: (x + crop.x) / zoom, y: (y + crop.y) / zoom }, -rotation)

	const setNewTransform = (
		newZoom: number,
		newRotation: number,
		point: { x: number; y: number },
		imagePoint?: { x: number; y: number },
	): void => {
		if (!mediaSize || !cropperSize) return
		const zoomPoint = getPointOnContainer(point)
		if (!zoomPoint) return
		const zoomTarget = imagePoint ?? getPointOnImage(zoomPoint)
		const nextZoom = Math.min(maxZoom, Math.max(newZoom, minZoom))
		const nextCropSize = containerRect
			? getCropSizeFor(mediaSize, containerRect, newRotation)
			: cropperSize
		if (!hasPositiveSize(nextCropSize)) return

		const rotatedTarget = helpers.rotatePoint({
			x: zoomTarget.x * nextZoom,
			y: zoomTarget.y * nextZoom,
		}, newRotation)
		const requestedPosition = {
			x: rotatedTarget.x - zoomPoint.x,
			y: rotatedTarget.y - zoomPoint.y,
		}
		zoom = nextZoom
		rotation = newRotation
		crop = restrictPosition
			? helpers.restrictPosition(
				requestedPosition,
				mediaSize,
				nextCropSize,
				nextZoom,
				newRotation,
			)
			: requestedPosition
	}

	const scheduleDebouncedCropComplete = (): void => {
		if (wheelTimer !== undefined) window.clearTimeout(wheelTimer)
		wheelTimer = window.setTimeout(() => {
			wheelTimer = undefined
			emitCropComplete()
		}, 250)
	}

	const onKeyDown = (e: KeyboardEvent): void => {
		const delta = e.key === 'ArrowLeft'
			? { x: -1, y: 0 }
			: e.key === 'ArrowRight'
			? { x: 1, y: 0 }
			: e.key === 'ArrowUp'
			? { x: 0, y: -1 }
			: e.key === 'ArrowDown'
			? { x: 0, y: 1 }
			: null
		if (!delta) return

		e.preventDefault()
		if (!keyboardInteractionActive) {
			computeSizes()
			keyboardInteractionActive = true
			keyboardInteractionChanged = false
		}
		if (!mediaSize || !cropperSize || !Number.isFinite(keyboardStep)) return

		const step = keyboardStep * (e.shiftKey ? 0.2 : 1)
		const requestedPosition = {
			x: crop.x + delta.x * step,
			y: crop.y + delta.y * step,
		}
		const nextCrop = restrictPosition
			? helpers.restrictPosition(requestedPosition, mediaSize, cropperSize, zoom, rotation)
			: requestedPosition
		if (nextCrop.x === crop.x && nextCrop.y === crop.y) return
		crop = nextCrop
		keyboardInteractionChanged = true
	}

	const finishKeyboardInteraction = (): void => {
		if (!keyboardInteractionActive) return
		keyboardInteractionActive = false
		if (keyboardInteractionChanged) emitCropComplete()
		keyboardInteractionChanged = false
	}

	const onKeyUp = (e: KeyboardEvent): void => {
		if (e.key.startsWith('Arrow')) finishKeyboardInteraction()
	}

	const onContainerBlur = (): void => finishKeyboardInteraction()

	const getSafariGestureValues = (event: Event): { scale: number; rotation: number } | null => {
		if (
			'scale' in event
			&& typeof event.scale === 'number'
			&& Number.isFinite(event.scale)
			&& 'rotation' in event
			&& typeof event.rotation === 'number'
			&& Number.isFinite(event.rotation)
		) {
			return { scale: event.scale, rotation: event.rotation }
		}
		return null
	}

	const onSafariGestureStart = (event: Event): void => {
		event.preventDefault()
		safariGesture = { kind: 'inactive' }
		if (touchGestureActive) {
			return
		}

		computeSizes()
		const rect = containerEl?.getBoundingClientRect()
		if (!rect || !mediaSize || !cropperSize) return
		const values = getSafariGestureValues(event)
		const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
		const zoomPoint = getPointOnContainer(point)
		if (!zoomPoint) return
		safariGesture = {
			kind: 'active',
			startZoom: zoom,
			startRotation: rotation,
			startScale: values && values.scale > 0 ? values.scale : 1,
			startEventRotation: values?.rotation ?? 0,
			imagePoint: getPointOnImage(zoomPoint),
		}
	}

	const onSafariGestureChange = (event: Event): void => {
		event.preventDefault()
		if (touchGestureActive || safariGesture.kind !== 'active') return
		const values = getSafariGestureValues(event)
		if (
			!values || !Number.isFinite(values.scale) || values.scale <= 0
			|| !Number.isFinite(values.rotation)
		) return
		const rect = containerEl?.getBoundingClientRect()
		if (!rect) return
		const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
		setNewTransform(
			safariGesture.startZoom * (values.scale / safariGesture.startScale),
			safariGesture.startRotation + values.rotation - safariGesture.startEventRotation,
			point,
			safariGesture.imagePoint,
		)
	}

	const onSafariGestureEnd = (event: Event): void => {
		event.preventDefault()
		if (touchGestureActive || safariGesture.kind !== 'active') {
			safariGesture = { kind: 'inactive' }
			return
		}
		safariGesture = { kind: 'inactive' }
		emitCropComplete()
	}

	const getCropData = (): OnCropCompleteEvent | null => {
		if (
			!mediaSize
			|| !initialCropAppliedForLoad
			|| !hasPositiveSize(mediaSize)
			|| !cropperSize
			|| !hasPositiveSize(cropperSize)
		) return null
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
		syncMediaSource()
		if (videoEl && videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) onMediaLoad()
		else if (imgEl?.complete && imgEl.naturalWidth > 0) onMediaLoad()
	})

	const attachContainer: Attachment<HTMLDivElement> = node => {
		const resizeObserver = typeof ResizeObserver === 'undefined'
			? undefined
			: new ResizeObserver(computeSizes)
		resizeObserver?.observe(node)
		untrack(computeSizes)

		const cleanups = [
			on(node, 'touchstart', onTouchStart, { passive: false }),
			on(node, 'mousedown', onMouseDown),
			on(node, 'wheel', onWheel, { passive: false }),
			on(node, 'gesturestart', onSafariGestureStart, { passive: false }),
			on(node, 'gesturechange', onSafariGestureChange, { passive: false }),
			on(node, 'gestureend', onSafariGestureEnd, { passive: false }),
		]

		return () => {
			cleanups.forEach(cleanup => cleanup())
			resizeObserver?.disconnect()
			cleanDragListeners()
			cancelPendingFrames()
			keyboardInteractionActive = false
			keyboardInteractionChanged = false
			touchGestureActive = false
			pinchGesture = null
			safariGesture = { kind: 'inactive' }
		}
	}
</script>

<svelte:window onresize={computeSizes} />
<div
	class="svelte-easy-crop-container"
	bind:this={containerEl}
	{@attach attachContainer}
	{tabindex}
	onkeydown={onKeyDown}
	onkeyup={onKeyUp}
	onblur={onContainerBlur}
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
			onloadstart={onMediaLoadStart}
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
