# svelte-crop

A Svelte component to crop images with easy interactions

This is a rewrite of `react-easy-crop` (https://github.com/valentinh/react-easy-crop).


> ℹ️ The minimum supported Svelte version is v5. If you are still on an older version, you need to use the 3.x.x versions of `svelte-crop`

[![npm version][version-badge]][package] [![Monthly downloads][downloads-badge]][npmstats] [![gzip size][gzip-badge]][package] [![License: GLWTS][license-badge]][license] [![PRs welcome][prs-badge]][prs]

![svelte-crop Demo](https://user-images.githubusercontent.com/2678610/41561426-365e7a44-734a-11e8-8e0e-1c04251f53e4.gif)


## Demo

- [Basic example](https://svelte.dev/playground/1399673f20264e0e91eac9e9b99cd495?version=latest)

## Features

- Supports drag and zoom interactions
- Supports pinch zoom, two-finger rotation, and video sources
- Supports `contain` and `cover` object fits (including `horizontal-cover` and `vertical-cover`)
- Supports arrow-key cropping and restoring saved crops
- Recalculates the crop when its container resizes
- Provides crop dimensions as pixels and percentages
- Supports any images format (JPEG, PNG, even GIF) as url or base 64 string
- Emits live crop area updates while cropping
- Mobile friendly

## Installation

```shell
yarn add svelte-crop
```

or

```shell
npm install svelte-crop --save
```

## Basic usage

> The Cropper is styled with `position: absolute` to take the full space of its parent.
> Thus, you need to wrap it with an element that uses `position: relative` or the Cropper will fill the whole page.

```jsx
<script>
  import Cropper from 'svelte-crop'

  let image = '/images/dog.jpeg'
  let crop = $state({ x: 0, y: 0 });
  let zoom = $state(1);
</script>

<Cropper
  {image}
  bind:crop
  bind:zoom
  oncropcomplete={(e) => console.log(e)}
/>
```

## Props

| Prop               | Type                                | Required | Description                                                                                                                                                                                                                                                                                                 |
| :----------------- | :---------------------------------- | :------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`            | string                              | one of the two | Image URL or data URL. Provide exactly one of `image` or `video`.                                                                                                                                                                                                                                     |
| `video`            | `string \| { src: string, type?: string }[]` | one of the two | Video URL or source list. Video playback is muted, looping, and inline.                                                                                                                                                                                                                         |
| `crop`             | `{ x: number, y: number }`          |          | Position of the media. `{ x: 0, y: 0 }` centers it under the crop area.                                                                                                                                                                                                                                     |
| `zoom`             | number                              |          | Zoom of the media between `minZoom` and `maxZoom`. Defaults to 1.                                                                                                                                                                                                                                           |
| `rotation`         | number                              |          | Rotation in degrees. Defaults to 0. Use `bind:rotation` to receive changes from touch and trackpad rotation gestures. |
| `keyboardStep`     | number                              |          | Distance in CSS pixels moved by each arrow-key press. Defaults to 1. Hold Shift for a step one fifth as large. |
| `tabindex`         | number                              |          | Defaults to 0 so the cropper can receive keyboard focus. Use -1 to remove it from sequential keyboard navigation. |
| `initialCroppedAreaPercentages` | `CropArea`              |          | Restores a saved percentage crop when media loads. Takes precedence over `initialCroppedAreaPixels`. |
| `initialCroppedAreaPixels` | `CropArea`                   |          | Restores a saved pixel crop when media loads. Percentage crops avoid drift caused by rounded pixel output. |
| `aspect`           | number                              |          | Aspect of the cropper. The value is the ratio between its width and its height. The default value is `4/3`.                                                                                                                                                                                                 |
| `minZoom`          | number                              |          | Minimum zoom of the media. Defaults to 1.                                                                                                                                                                                                                                                                   |
| `maxZoom`          | number                              |          | Maximum zoom of the media. Defaults to 3.                                                                                                                                                                                                                                                                   |
| `cropShape`        | 'rect' \| 'round'                   |          | Shape of the crop area. Defaults to 'rect'.                                                                                                                                                                                                                                                                 |
| `objectFit`        | 'contain' \| 'cover' \| 'horizontal-cover' \| 'vertical-cover' |       | How the media is fitted inside the cropper. `contain` keeps it fully visible. `horizontal-cover` fills the cropper width, `vertical-cover` fills its height, and `cover` picks whichever keeps the media fully visible. Defaults to `contain`. |
| `cropSize`         | `{ width: number, height: number }` |          | Size of the crop area (in pixels). If you don't provide it, it is computed from `aspect`, the media, and its rotation.                                                                                                                                        |
| `showGrid`         | boolean                             |          | Whether to show or not the grid (third-lines). Defaults to `true`.                                                                                                                                                                                                                                          |
| `zoomSpeed`        | number                              |          | Multiplies the value by which the zoom changes. Defaults to 1.                                                                                                                                                                                                                                              |
| `zoomWithScroll`   | boolean                             |          | Whether the mouse wheel zooms the media. Defaults to `true`. Set to `false` to let the wheel scroll the page over the cropper.                                                                                                                                                                               |
| `crossOrigin`      | string                              |          | Allows setting the crossOrigin attribute on the image or video.                                                                                                                                                                                                                                             |
| `restrictPosition` | boolean                             |          | Whether the position of the media should be restricted to the boundaries of the cropper.                                                                                                                                                                                                                   |
| `oncropcomplete`   | function(details)                    |          | Called when media loads and after an interaction settles. Use this callback to save the cropped area.                                                                                                                                                                                                        |
| `oncropareachange` | function(details)                    |          | Called whenever crop, zoom, rotation, or media dimensions change. It has the same `{ percent, pixels }` payload as `oncropcomplete`.                                                                                                                                                                         |
| `onMediaLoaded`    | function(mediaSize)                  |          | Called once per media source after it loads and its rendered size is measured. `mediaSize` is `{ width, height, naturalWidth, naturalHeight }` where `width`/`height` are the rendered (object-fit dependent) bounds and `natural*` the source pixels. Useful for a custom zoom or crop strategy based on media size. |

## Restoring a saved crop

Save the `percent` value from `oncropcomplete` and pass it back when reopening the editor. Save `rotation` separately and supply it with the saved area.

```svelte
<Cropper
  {image}
  bind:crop
  bind:zoom
  bind:rotation
  initialCroppedAreaPercentages={savedArea}
/>
```

Initial crop props are applied when the media loads. Changing these props alone does not reset an active edit. A container resize preserves the current selection where the zoom limits and position restrictions allow it, without reapplying the initial crop.

For an explicit restore during editing, the package exports `getInitialCropFromCroppedAreaPercentages` and `getInitialCropFromCroppedAreaPixels`. Both accept an options object and return `{ crop, zoom }`:

```ts
import { getInitialCropFromCroppedAreaPercentages } from 'svelte-crop'

const restored = getInitialCropFromCroppedAreaPercentages({
  croppedAreaPercentages: savedArea,
  mediaSize, // { width, height, naturalWidth, naturalHeight }
  cropSize, // { width, height }
  rotation,
  minZoom: 1,
  maxZoom: 3,
})

crop = restored.crop
zoom = restored.zoom
```

The pixel helper uses `croppedAreaPixels` instead. The helpers default to rotation 0 and zoom limits 1–3. They reject non-finite values, non-positive dimensions, and invalid zoom limits with `RangeError`.

## Callbacks

### oncropareachange

Use this callback for a live preview of the crop coordinates. Keep `oncropcomplete` for saving a crop after an interaction settles.

```svelte
<Cropper
  {image}
  bind:crop
  bind:zoom
  bind:rotation
  oncropareachange={(area) => (liveCrop = area)}
/>
```

### oncropcomplete

```tsx
<Cropper
  {image}
  bind:crop
  bind:zoom
  oncropcomplete={(e) => console.log(e)}
/>
```

The `detail` property is an object with 2 values:

1. `percent`: coordinates and dimensions of the cropped area in percentage of the image dimension
1. `pixels`: coordinates and dimensions of the cropped area in pixels.

Both arguments have the following shape:

```js
const area = {
  x: number, // x/y are the coordinates of the top/left corner of the cropped area
  y: number,
  width: number, // width of the cropped area
  height: number, // height of the cropped area
}
```

### onMediaLoaded

Called once per media source with its rendered size. Use it to adapt zoom or crop from the measured media, for example to always fit a fixed height:

```svelte
<Cropper
  {image}
  bind:crop
  bind:zoom
  onMediaLoaded={({ height }) => (zoom = CONTAINER_HEIGHT / height)}
/>
```


## Development

```shell
bun install
bun run dev
```

Open `http://localhost:3000` to use the demo. Install the Playwright browser once with `bunx playwright install chromium`, then run browser tests with `bun run e2e`. Run `bun run unit` for helper tests, `bun run lint` for ESLint and dprint, and `bun run check` for Svelte and TypeScript diagnostics.

## License

[GLWTS](https://github.com/Lost-Saint/svelte-crop/blob/main/LICENSE)

[version-badge]: https://img.shields.io/npm/v/svelte-crop?style=flat-square
[package]: https://www.npmjs.com/package/svelte-crop
[downloads-badge]: https://img.shields.io/npm/dm/svelte-crop?style=flat-square
[npmstats]: https://npm-stat.com/charts.html?package=svelte-crop
[gzip-badge]: https://img.badgesize.io/https://unpkg.com/svelte-crop@0.0.2/dist/index.js?compression=gzip&style=flat-square
[license-badge]: https://img.shields.io/badge/license-GLWTS-blue?style=flat-square
[license]: https://github.com/Lost-Saint/svelte-crop/blob/main/LICENSE
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square
[prs]: https://github.com/Lost-Saint/svelte-crop/pulls
