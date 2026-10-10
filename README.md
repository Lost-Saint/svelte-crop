# svelte-easy-crop

A Svelte component to crop images with easy interactions

This is a rewrite of `react-easy-crop` (https://github.com/valentinh/react-easy-crop).


> ℹ️ The minimum supported Svelte version is v5. If you are still on an older version, you need to use the 3.x.x versions of `svelte-easy-crop`

[![version][version-badge]][package] [![Monthly downloads][npmstats-badge]][npmstats] ![gzip size][gzip-badge] [![MIT License][license-badge]][license] [![PRs Welcome][prs-badge]][prs]

![svelte-easy-crop Demo](https://user-images.githubusercontent.com/2678610/41561426-365e7a44-734a-11e8-8e0e-1c04251f53e4.gif)


## Demo

- [Basic example](https://svelte.dev/playground/5d77c734e1af424bac9e09a844c96649?version=latest)

## Features

- Supports drag and zoom interactions
- Supports pinch zoom, rotation, and video sources
- Provides crop dimensions as pixels and percentages
- Supports any images format (JPEG, PNG, even GIF) as url or base 64 string
- Emits live crop area updates while cropping
- Mobile friendly

## Installation

```shell
yarn add svelte-easy-crop
```

or

```shell
npm install svelte-easy-crop --save
```

## Basic usage

> The Cropper is styled with `position: absolute` to take the full space of its parent.
> Thus, you need to wrap it with an element that uses `position: relative` or the Cropper will fill the whole page.

```jsx
<script>
  import Cropper from 'svelte-easy-crop'

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
| `rotation`         | number                              |          | Rotation in degrees. Defaults to 0. Can be bound to update it from user controls.                                                                                                                                                                                                                            |
| `aspect`           | number                              |          | Aspect of the cropper. The value is the ratio between its width and its height. The default value is `4/3`.                                                                                                                                                                                                 |
| `minZoom`          | number                              |          | Minimum zoom of the media. Defaults to 1.                                                                                                                                                                                                                                                                   |
| `maxZoom`          | number                              |          | Maximum zoom of the media. Defaults to 3.                                                                                                                                                                                                                                                                   |
| `cropShape`        | 'rect' \| 'round'                   |          | Shape of the crop area. Defaults to 'rect'.                                                                                                                                                                                                                                                                 |
| `cropSize`         | `{ width: number, height: number }` |          | Size of the crop area (in pixels). If you don't provide it, it is computed from `aspect`, the media, and its rotation.                                                                                                                                        |
| `showGrid`         | boolean                             |          | Whether to show or not the grid (third-lines). Defaults to `true`.                                                                                                                                                                                                                                          |
| `zoomSpeed`        | number                              |          | Multiplies the value by which the zoom changes. Defaults to 1.                                                                                                                                                                                                                                              |
| `crossOrigin`      | string                              |          | Allows setting the crossOrigin attribute on the image or video.                                                                                                                                                                                                                                             |
| `restrictPosition` | boolean                             |          | Whether the position of the media should be restricted to the boundaries of the cropper.                                                                                                                                                                                                                   |
| `oncropcomplete`   | function(details)                    |          | Called when media loads and after an interaction settles. Use this callback to save the cropped area.                                                                                                                                                                                                        |
| `oncropareachange` | function(details)                    |          | Called whenever crop, zoom, rotation, or media dimensions change. It has the same `{ percent, pixels }` payload as `oncropcomplete`.                                                                                                                                                                         |

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


## Development

```shell
bun install
bun run dev
```

Open `http://localhost:3000` to use the demo. Install the Playwright browser once with `bunx playwright install chromium`, then run browser tests with `bun run e2e`. Run `bun run unit` for helper tests, `bun run lint` for ESLint and dprint, and `bun run check` for Svelte and TypeScript diagnostics.

## License

[MIT](https://github.com/ValentinH/svelte-easy-crop/blob/master/LICENSE)

[npm]: https://www.npmjs.com/
[node]: https://nodejs.org
[version-badge]: https://img.shields.io/npm/v/svelte-easy-crop.svg?style=flat-square
[package]: https://www.npmjs.com/package/svelte-easy-crop
[downloads-badge]: https://img.shields.io/npm/dm/svelte-easy-crop.svg?style=flat-square
[npmstats]: http://npm-stat.com/charts.html?package=svelte-easy-crop&from=2018-06-18
[npmstats-badge]: https://img.shields.io/npm/dm/svelte-easy-crop.svg?style=flat-square
[gzip-badge]: http://img.badgesize.io/https://unpkg.com/svelte-easy-crop@1.0.0/index.js?compression=gzip&style=flat-square
[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square
[license]: https://github.com/ValentinH/svelte-easy-crop/blob/master/LICENSE
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square
[prs]: http://makeapullrequest.com
