<script lang="ts">
	import Cropper from '#lib'
	import type { CropArea, CropperOptions, OnCropCompleteEvent, Point } from '#lib'
	import { page } from '$app/state'

	const params = page.url.searchParams

	function parseValues(value: string | null, count: number): number[] | undefined {
		if (value === null) return undefined
		const values = value.split(',').map(Number)
		return values.length === count && values.every(Number.isFinite) ? values : undefined
	}

	function parseArea(value: string | null): CropArea | undefined {
		const [x, y, width, height] = parseValues(value, 4) ?? []
		if (x === undefined || y === undefined || width === undefined || height === undefined) {
			return undefined
		}
		return { x, y, width, height }
	}

	function parsePoint(value: string | null): Point | undefined {
		const [x, y] = parseValues(value, 2) ?? []
		if (x === undefined || y === undefined) return undefined
		return { x, y }
	}

	function parseNumber(value: string | null): number | undefined {
		if (value === null) return undefined
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}

	const initialPercent = parseArea(params.get('percent'))
	const initialPixels = parseArea(params.get('pixels'))
	const keyboardStep = parseNumber(params.get('keyboardStep'))
	const requestedObjectFit = params.get('objectFit')
	const objectFit = requestedObjectFit === 'contain'
			|| requestedObjectFit === 'cover'
			|| requestedObjectFit === 'horizontal-cover'
			|| requestedObjectFit === 'vertical-cover'
		? requestedObjectFit
		: undefined
	const cropperOptions: CropperOptions = {
		minZoom: 0.5,
		maxZoom: 3,
		...(initialPercent ? { initialCroppedAreaPercentages: initialPercent } : {}),
		...(initialPixels ? { initialCroppedAreaPixels: initialPixels } : {}),
		...(keyboardStep === undefined ? {} : { keyboardStep }),
		...(objectFit === undefined ? {} : { objectFit }),
		...(params.get('zoomWithScroll') === '0' ? { zoomWithScroll: false } : {}),
	}

	let crop = $state(parsePoint(params.get('crop')) ?? { x: 0, y: 0 })
	let zoom = $state(parseNumber(params.get('zoom')) ?? 1)
	let rotation = $state(parseNumber(params.get('rotation')) ?? 0)
	let lastCrop = $state.raw<OnCropCompleteEvent | null>(null)
	let liveCrop = $state.raw<OnCropCompleteEvent | null>(null)
	let loadedMediaSize = $state.raw<{ width: number; height: number } | null>(null)
	let loadedCount = $state(0)
	let completeCount = $state(0)
	let visible = $state(params.get('hidden') !== '1')
	let parentWidth = $state(parseNumber(params.get('parentWidth')) ?? 1280)
	let parentHeight = $state(parseNumber(params.get('parentHeight')) ?? 720)

	const hasVideo = params.get('video') === '1'
	const image = params.get('img') ?? '/images/dog.jpeg'

	const handleCropComplete = (event: OnCropCompleteEvent): void => {
		lastCrop = event
		completeCount += 1
	}

	const handleCropAreaChange = (event: OnCropCompleteEvent): void => {
		liveCrop = event
	}

	const handleMediaLoaded = (mediaSize: { width: number; height: number }): void => {
		loadedMediaSize = { width: mediaSize.width, height: mediaSize.height }
		loadedCount += 1
	}

	const resizeParent = (): void => {
		parentWidth -= 100
		parentHeight -= 60
	}
</script>

<div
	class="parent"
	data-testid="parent"
	style:width={`${parentWidth}px`}
	style:height={`${parentHeight}px`}
	style:display={visible ? 'block' : 'none'}
>
	{#if hasVideo}
		<Cropper
			video="/videos/sample.webm"
			{...cropperOptions}
			bind:crop
			bind:zoom
			bind:rotation
			oncropcomplete={handleCropComplete}
			oncropareachange={handleCropAreaChange}
			onMediaLoaded={handleMediaLoaded}
		/>
	{:else}
		<Cropper
			{image}
			{...cropperOptions}
			bind:crop
			bind:zoom
			bind:rotation
			oncropcomplete={handleCropComplete}
			oncropareachange={handleCropAreaChange}
			onMediaLoaded={handleMediaLoaded}
		/>
	{/if}
</div>

<div class="controls">
	<button data-testid="resize-parent" onclick={resizeParent}>Resize parent</button>
	<button data-testid="toggle-visible" onclick={() => (visible = !visible)}>
		{visible ? 'Hide parent' : 'Show parent'}
	</button>
</div>

<output data-testid="rotation">{rotation}</output>
<output data-testid="zoom">{zoom}</output>
<output data-testid="crop-position">{JSON.stringify(crop)}</output>
<output data-testid="complete-count">{completeCount}</output>
{#if loadedMediaSize}
	<output data-testid="media-size">{JSON.stringify(loadedMediaSize)}</output>
{/if}
<output data-testid="media-loaded-count">{loadedCount}</output>

{#if lastCrop}
	<pre data-testid="crop-data">{JSON.stringify(lastCrop)}</pre>
{/if}
{#if liveCrop}
	<pre data-testid="live-crop-data">{JSON.stringify(liveCrop)}</pre>
{/if}

<style>
.parent {
	position: fixed;
	top: 0;
	left: 0;
}

.controls {
	position: fixed;
	right: 0;
	bottom: 0;
	z-index: 10;
	display: flex;
	gap: 0.5rem;
}

output,
pre {
	position: fixed;
	left: 0;
	z-index: 11;
	margin: 0;
	padding: 0.25rem;
	background: rgb(0 0 0 / 70%);
	color: white;
	font: 12px monospace;
	pointer-events: none;
}

[data-testid="rotation"] {
	top: 0;
}

[data-testid="zoom"] {
	top: 1.5rem;
}

[data-testid="crop-position"] {
	top: 3rem;
}

[data-testid="complete-count"] {
	top: 4.5rem;
}

[data-testid="media-size"] {
	top: 6rem;
}

[data-testid="media-loaded-count"] {
	top: 8rem;
}

pre {
	bottom: 0;
	max-width: 100vw;
	overflow: hidden;
}
</style>
