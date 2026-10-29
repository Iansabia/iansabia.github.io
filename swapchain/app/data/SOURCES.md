# Data sources

All map geometry and dorm facts come from public sources. Students, listings and profiles are made up (see data/people.js).

## Map geometry (data/campus.js)

- OpenStreetMap through the Overpass API (https://overpass-api.de/api/interpreter), downloaded on 2026-10-25 by `tools/build_campus.py`. Map data © OpenStreetMap contributors, licensed under the ODbL (https://www.openstreetmap.org/copyright).
- Area: south 42.3435, west -71.1265, north 42.3555, east -71.0890 (BU Charles River Campus, Kenmore Square, Fenway, and the river).
- Contents: buildings and building:part pieces, water (natural=water, waterway=riverbank), green areas (parks, grass, pitches, gardens, recreation grounds, woods), roads (major, minor, footpaths) and rail (Green Line B/C/D, Worcester Main Line).
- Processing: heights from `height`, else `building:levels` x 3.2 m, else a default by building type. Polygons are clipped to the area, simplified (Douglas-Peucker 0.6 m for buildings, 1.5 m for water and green, 1.0 m for roads), rounded to 6 decimals, and outer rings are counterclockwise. When building:part pieces cover at least half of a building, the parts are drawn instead of the outline (`partOf` points to the outline id). Tunnels and underground features are left out.

## Dorms (data/dorms.js)

| Dorm | Facts used | Source |
| --- | --- | --- |
| Warren Towers | Three towers: A Fairfield, B Marshall, C Shields (east to west). 18 stories each on a 4-story base (garage on floors 1 to 3, lobby and dining hall on 4); rooms on floors 5 to 18; singles, doubles, triples, quads; about 1,800 students. Tower B renovation Dec 2026 to Aug 2027. | https://www.bu.edu/housing/residence/large-traditional-style-residences/warren-towers/ , https://www.bu.edu/housing/residence/warren-towers-a-fairfield/ , https://www.bu.edu/articles/2026/warren-towers-tower-a-reopens-to-students/ , https://en.wikipedia.org/wiki/Warren_Towers |
| 610 Beacon Street (Myles) | Renamed from Myles Standish Hall in May 2024. Floor plans for floors 1 to 9, suite double and suite single layouts, 730+ students. | https://www.bu.edu/housing/residence/large-traditional-style-residences/610-beacon-street/ , https://www.bu.edu/timeline/2024/05/23/boston-university-removes-the-myles-standish-name-from-dorm , https://en.wikipedia.org/wiki/Boston_University_Housing_System |
| Claflin Hall | West Campus tower, floor plans for floors 2 to 13, single, double, triple, quad, semi-suite triple; CFA floor on 9. | https://www.bu.edu/housing/residence/large-traditional-style-residences/claflin-hall/ |
| Sleeper Hall | West Campus tower, floors 2 to 13, single, double, triple. | https://www.bu.edu/housing/residence/large-traditional-style-residences/sleeper-hall/ |
| Rich Hall | West Campus tower, floors 2 to 13, single, double, triple; West Campus mail room. | https://www.bu.edu/housing/residence/large-traditional-style-residences/rich-hall/ |
| Kilachand Hall | 91 Bay State Rd, floor plans for floors 2 to 8, suite and semi-suite doubles and triples, honors floors 2 to 5, 9th-floor lounge. Former 1923 hotel. | https://www.bu.edu/housing/residence/large-traditional-style-residences/kilachand-hall/ , https://en.wikipedia.org/wiki/Boston_University_Housing_System |
| The Towers | 140 Bay State Rd, two 9-story towers joined by a one-story link, floors 2 to 9, traditional doubles. | https://www.bu.edu/housing/residence/large-traditional-style-residences/the-towers/ , https://en.wikipedia.org/wiki/Boston_University_Housing_System |
| Danielsen Hall | 512 Beacon St, floor plans for floors 1 to 10, single, double, triple, semi-suite double. | https://www.bu.edu/housing/residence/large-traditional-style-residences/danielsen-hall/ |
| 1019 Commonwealth Avenue | West Campus, floors 2 to 6, six-person suites (suite double and suite single). | https://www.bu.edu/housing/residence/large-traditional-style-residences/1019-commonwealth-avenue/ |
| 575 Commonwealth Avenue | Former Howard Johnson hotel ("HoJo"), floors 2 to 7, single, triple, semi-suite double, in-room bathrooms. | https://www.bu.edu/housing/residence/large-traditional-style-residences/575-commonwealth-avenue/ , https://en.wikipedia.org/wiki/Boston_University_Housing_System |

Room type mapping: BU's "Suite Single" and "Suite Double" become `suite`; "Semi-Suite Double" becomes `double`; "Semi-Suite Triple" becomes `triple`; traditional rooms keep their size.

Student Village (10 Buick St and 33 Harry Agganis Way) is left out of DORMS on purpose (premium price tier). Its buildings stay on the map with `dormId: null`. Source: https://www.bu.edu/housing/residence/student-village/

## Approximations and judgment calls

- Building heights are estimates: 3.2 m per storey times the OSM level count, since OSM has no measured heights for these halls.
- Warren Towers has no height tag in OSM. Towers are set to 18 x 3.2 = 57.6 m and the 4-story base parts to 12.8 m, from BU Today (Sept 2026) and Wikipedia.
- Claflin, Sleeper and Rich have 12 levels in OSM, but BU posts floor plans up to floor 13, so their height is raised to 13 x 3.2 = 41.6 m.
- `floors` is the range of BU's posted residential floor plans. Kilachand's 9th floor (lounge) and HoJo's 8th floor (study floor) are left out.
- OSM still names two buildings "Myles Standish Hall" and "Danielson Hall"; the build renames dorm buildings to BU's current names.
- All dorms use `priceTier: "standard"`. BU's actual rates differ by room type, which the demo does not model.
