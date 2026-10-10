<script lang="ts">
	import Cropper from '#lib'
	import type { OnCropCompleteEvent } from '#lib'
	import { page } from '$app/state'

	let crop = $state({ x: 0, y: 0 })
	let zoom = $state(1)
	let rotation = $state(page.url.searchParams.get('rotation') === '90' ? 90 : 0)
	const minZoom = 0.5
	const maxZoom = 3
	let lastCrop = $state.raw<OnCropCompleteEvent | null>(null)
	let liveCrop = $state.raw<OnCropCompleteEvent | null>(null)

	// Derived from SvelteKit page state — reactive, SSR-safe, no window check needed.
	// ?img=... override keeps the e2e hook; defaults to the demo image.
	let image = $derived(page.url.searchParams.get('img') ?? '/images/dog.jpeg')
	let video = $derived(page.url.searchParams.get('video'))

	const handleCropComplete = (event: OnCropCompleteEvent): void => {
		lastCrop = event
	}

	const handleCropAreaChange = (event: OnCropCompleteEvent): void => {
		liveCrop = event
	}
</script>

{#if video === null}
	<Cropper
		{image}
		{minZoom}
		{maxZoom}
		bind:crop
		bind:zoom
		bind:rotation
		oncropcomplete={handleCropComplete}
		oncropareachange={handleCropAreaChange}
	/>
{:else}
	<Cropper
		{video}
		{minZoom}
		{maxZoom}
		bind:crop
		bind:zoom
		bind:rotation
		oncropcomplete={handleCropComplete}
		oncropareachange={handleCropAreaChange}
	/>
{/if}

{#if lastCrop}
	<pre data-testid="crop-data" class="crop-data">{JSON.stringify(lastCrop)}</pre>
{/if}
{#if liveCrop}
	<pre data-testid="live-crop-data" class="live-crop-data">{JSON.stringify(liveCrop)}</pre>
{/if}

<style>
/* Fixed overlay, click-through: never intercepts crop interactions or layout. */
.crop-data,
.live-crop-data {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	margin: 0;
	padding: 0.5rem;
	overflow: hidden;
	background: rgb(0 0 0 / 0.65);
	color: #fff;
	font-size: 12px;
	pointer-events: none;
}

.live-crop-data {
	bottom: auto;
	top: 0;
}
</style>
