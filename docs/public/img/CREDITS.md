# Photo credits

Sample photography for the example gallery. Every file here is from Unsplash
and used under the [Unsplash License](https://unsplash.com/license), which
permits commercial use with no permission and no attribution required.
Credited anyway, because the photographers earned it.

Each image ships as AVIF with a WebP fallback, at 1000px for the full view and
420px for grid thumbnails. Re-encode with ImageMagick if you replace one:

```
magick <source>.jpg -resize 1000x667 -strip -quality 46 shot-NN.avif
magick <source>.jpg -resize 1000x667 -strip -quality 68 shot-NN.webp
magick <source>.jpg -resize 420x280  -strip -quality 50 shot-NN-thumb.avif
magick <source>.jpg -resize 420x280  -strip -quality 70 shot-NN-thumb.webp
```

| File | Photographer | Source |
| --- | --- | --- |
| `shot-01` | Arvee Marie | https://unsplash.com/photos/YnfGtpt2gf4 |
| `shot-02` | Go Wild | https://unsplash.com/photos/V0yAek6BgGk |
| `shot-03` | Austin Neill | https://unsplash.com/photos/erTjj730fMk |
| `shot-04` | Luke Chesser | https://unsplash.com/photos/KR2mdHJ5qMg |
| `shot-05` | Nicholas Swanson | https://unsplash.com/photos/d19by2PLaPc |
| `shot-06` | Alexander Shustov | https://unsplash.com/photos/OxzhYtL-00Y |
