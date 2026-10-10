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
	<pre data-testid="crop-data">{JSON.stringify(lastCrop)}</pre>
{/if}
