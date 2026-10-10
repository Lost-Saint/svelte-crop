<script lang="ts">
	import Cropper from '#lib'
	import type { OnCropCompleteEvent } from '#lib'
	import { page } from '$app/state'

	let crop = $state({ x: 0, y: 0 })
	let zoom = $state(1)
	const minZoom = 0.5
	const maxZoom = 3
	let lastCrop = $state.raw<OnCropCompleteEvent | null>(null)

	// Derived from SvelteKit page state — reactive, SSR-safe, no window check needed.
	// ?img=... override keeps the e2e hook; defaults to the demo image.
	let image = $derived(page.url.searchParams.get('img') ?? '/images/dog.jpeg')

	const handleCropComplete = (event: OnCropCompleteEvent): void => {
		lastCrop = event
	}
</script>

<Cropper
	{image}
	{minZoom}
	{maxZoom}
	bind:crop
	bind:zoom
	oncropcomplete={handleCropComplete}
/>

{#if lastCrop}
	<pre data-testid="crop-data" class="crop-data">{JSON.stringify(lastCrop)}</pre>
{/if}

<style>
/* Fixed overlay, click-through: never intercepts crop interactions or layout. */
.crop-data {
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
</style>
