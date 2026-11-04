# Data sources for the Miacomet hole demo

## Course outlines: OpenStreetMap

- Map data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright
- Area: bbox -70.140, 41.235, -70.090, 41.275 (Miacomet Golf Club, Nantucket, and its surroundings).
- Downloaded once with the OpenStreetMap API 0.6 `map` call and cached locally. Nothing is fetched at runtime.
- Used tags: `leisure=golf_course`; `golf=hole` (with `ref`, `par`, `handicap`), `golf=tee`, `golf=fairway`, `golf=green`, `golf=bunker`, `golf=rough`, `golf=driving_range`, `golf=cartpath`; water (`natural=water`, `water=*`), roads and paths (`highway=*`), and buildings (`building=*`) as sketch context.
- The hole shown is the one OSM tags as `golf=hole`, `ref=10`, `par=4`. Its length on screen ("about 393 yd") is measured along that mapped hole line, not taken from a scorecard.

## Elevation: AWS Terrain Tiles

- Terrarium PNG tiles at zoom 15 from https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/X/Y.png (Mapzen / AWS Open Data, free to use; see https://github.com/tilezen/joerd/blob/master/docs/attribution.md for the underlying sources).
- Sampled on a regular grid and stored as decimeters. Nantucket is flat, so the page draws the relief at 2x.

## Processing

`tools/build_hole.py` turns the cached OSM file and tiles into `hole.js`: coordinates become meters east and north of a local origin, shapes are simplified, and terrain heights are sampled on a grid.

## What is made up

The golfer, the three shots, their yardages, the 12-shot miss pattern and the advice are an illustrative example written for this demo. None of it is real tracked data.

The flag position is also not mapped: OSM has no pin for this hole, so the flag is placed where the OSM hole line ends on the green (or at the green's center if the line ends outside it). Real pin positions change day to day.
