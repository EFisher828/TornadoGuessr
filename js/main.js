// Constants from the Python script
const BASE_DATE = new Date(Date.UTC(2013, 0, 1)); // Jan 1, 2006
const MONTHS = [3, 4, 5]; // April, May, June (0-based: 3, 4, 5)
const MAPS = ['ttd', '300mb', '500mb', '700mb', '850mb'];
const SPC_REPORTS_URL = "https://www.spc.noaa.gov/climo/reports/";
const SPC_MAPS_URL = "https://www.spc.noaa.gov/obswx/maps/";
const MA_ARCHIVE_URL = "https://www.spc.noaa.gov/exper/ma_archive/images_s4/";
let selectedDatetag = ''; // Store the YYMMDD format
let minCircles = 0;
let userGuesses = [];
let formattedDate;

let currentMapIndex = 0;
let mapUrls = [];

function changeMap(direction) {
    currentMapIndex += direction;
    if (currentMapIndex < 0) currentMapIndex = mapUrls.length - 1;
    if (currentMapIndex >= mapUrls.length) currentMapIndex = 0;
    document.getElementById('large-map').src = mapUrls[currentMapIndex];
}

function showPredictionMap() {

    const modal = document.getElementById('map-modal');
    modal.style.display = 'flex';

    const mapDiv = document.getElementById('map');

    // Initialize MapLibre map if not already initialized
    if (!mapDiv.dataset.initialized) {
        const map = new maplibregl.Map({
            container: 'map',
            style: './roads-basemap-with-terrain.json',
            center: [-96, 38], // Central US
            zoom: 3.8
        });

        map.on('load', () => {
            // Fetch and display tornado reports
            const url = `https://utility.arcgis.com/sharing/kml?url=https%3A%2F%2Fwww.spc.noaa.gov%2Fclimo%2Freports%2F${selectedDatetag}_rpts_filtered.kmz&model=simple&outSR=%7B%22wkid%22%3A4326%7D`;
            console.log(url)
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    console.log(data)
                    const features = data.featureCollection.layers.find(layer => layer.featureSet.geometryType === 'esriGeometryPoint').featureSet.features;
                    console.log(features)
                    const tornadoFeatures = features
                        .filter(f => f.attributes.styleUrl.includes('tornado'))
                        .map(f => ({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [f.geometry.x, f.geometry.y]
                            },
                            properties: {
                                name: f.attributes.name,
                                time: new Date(f.attributes.begin).toISOString(),
                                description: f.attributes.description
                            }
                        }));

                      console.log(tornadoFeatures)

                      // Store tornadoes but don’t display yet
                      map.addSource('tornadoes', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] } // Empty initially
                      });

                      map.addLayer({
                          id: 'tornado-points',
                          type: 'circle',
                          source: 'tornadoes',
                          paint: {
                              'circle-radius': 5,
                              'circle-color': '#ff0000'
                          }
                      });

                      map.addSource('prediction-points', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] }
                      });

                      map.addSource('prediction-circles-50', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] }
                      });

                      map.addSource('prediction-circles-100', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] }
                      });

                      map.addSource('prediction-circles-150', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] }
                      });

                      map.addLayer({
                          id: 'prediction-circles-150-layer',
                          type: 'fill',
                          source: 'prediction-circles-150',
                          paint: {
                              'fill-color': '#FE5F20', // Orange
                              'fill-opacity': 0.3
                          }
                      }, 'aeroway-runway');

                      map.addLayer({
                          id: 'prediction-circles-100-layer',
                          type: 'fill',
                          source: 'prediction-circles-100',
                          paint: {
                              'fill-color': '#F3B62B', // Yellow
                              'fill-opacity': 0.3
                          }
                      }, 'aeroway-runway');

                      map.addLayer({
                          id: 'prediction-circles-50-layer',
                          type: 'fill',
                          source: 'prediction-circles-50',
                          paint: {
                              'fill-color': '#0E4DAD', // Blue
                              'fill-opacity': 0.3
                          }
                      }, 'aeroway-runway');

                      map.addLayer({
                          id: 'prediction-points-layer',
                          type: 'circle',
                          source: 'prediction-points',
                          paint: {
                              'circle-radius': 6,
                              'circle-color': '#000000'
                          }
                      }, 'aeroway-runway');

                      // Calculate minimum circles
                      const tornadoPoints = tornadoFeatures.map(f => f.geometry.coordinates);
                      minCircles = calculateMinCircles(tornadoPoints, 50);
                      window.tornadoData = tornadoFeatures; // Store for later

                      document.getElementById('guess-count').innerText = minCircles;

                      // Dragging state
                      let draggedPointIndex = null;

                      // Click to add or select point for dragging
                      map.on('click', (e) => {
                          const features = map.queryRenderedFeatures(e.point, { layers: ['prediction-points-layer'] });
                          if (features.length > 0) {
                              // Clicked an existing point, prepare to drag
                              draggedPointIndex = features[0].id; // Use feature ID to track
                              map.getCanvas().style.cursor = 'grab';
                              return;
                          }

                          if (userGuesses.length >= minCircles) {
                              alert('You’ve used all your guesses!');
                              return;
                          }

                          const coords = e.lngLat;
                          const pointFeature = {
                              type: 'Feature',
                              geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
                              id: userGuesses.length // Assign ID for tracking
                          };

                          // 50-mi solid circle
                          const circle50 = turf.circle([coords.lng, coords.lat], 50, { steps: 64, units: 'miles' });

                          // 100-mi ring (100 mi outer, 50 mi inner)
                          const circle100Outer = turf.circle([coords.lng, coords.lat], 100, { steps: 64, units: 'miles' });
                          const circle100Inner = turf.circle([coords.lng, coords.lat], 50, { steps: 64, units: 'miles' });
                          const circle100Ring = turf.polygon([
                              circle100Outer.geometry.coordinates[0], // Outer ring
                              circle100Inner.geometry.coordinates[0]  // Inner ring (hole)
                          ]);

                          // 150-mi ring (150 mi outer, 100 mi inner)
                          const circle150Outer = turf.circle([coords.lng, coords.lat], 150, { steps: 64, units: 'miles' });
                          const circle150Inner = turf.circle([coords.lng, coords.lat], 100, { steps: 64, units: 'miles' });
                          const circle150Ring = turf.polygon([
                              circle150Outer.geometry.coordinates[0], // Outer ring
                              circle150Inner.geometry.coordinates[0]  // Inner ring (hole)
                          ]);

                          userGuesses.push([coords.lng, coords.lat]);
                          const pointsData = map.getSource('prediction-points')._data;
                          pointsData.features.push(pointFeature);
                          map.getSource('prediction-points').setData(pointsData);

                          const circles50Data = map.getSource('prediction-circles-50')._data;
                          circles50Data.features.push(circle50);
                          map.getSource('prediction-circles-50').setData(circles50Data);

                          const circles100Data = map.getSource('prediction-circles-100')._data;
                          circles100Data.features.push(circle100Ring);
                          map.getSource('prediction-circles-100').setData(circles100Data);

                          const circles150Data = map.getSource('prediction-circles-150')._data;
                          circles150Data.features.push(circle150Ring);
                          map.getSource('prediction-circles-150').setData(circles150Data);

                          document.getElementById('submit-forecast-btn').style.display = 'block';
                      });

                      // Start dragging
                      map.on('mousedown', 'prediction-points-layer', (e) => {
                          e.preventDefault(); // Prevent default map panning
                          draggedPointIndex = e.features[0].id;
                          map.getCanvas().style.cursor = 'grabbing';

                          map.on('mousemove', onMove);
                          map.once('mouseup', onUp);
                      });

                      // Update position during drag
                      function onMove(e) {
                          if (draggedPointIndex === null) return;

                          const coords = e.lngLat;
                          userGuesses[draggedPointIndex] = [coords.lng, coords.lat];

                          const pointsData = map.getSource('prediction-points')._data;
                          pointsData.features[draggedPointIndex].geometry.coordinates = [coords.lng, coords.lat];
                          map.getSource('prediction-points').setData(pointsData);

                          const circles50Data = map.getSource('prediction-circles-50')._data;
                          circles50Data.features[draggedPointIndex] = turf.circle([coords.lng, coords.lat], 50, { steps: 64, units: 'miles' });
                          map.getSource('prediction-circles-50').setData(circles50Data);

                          const circles100Data = map.getSource('prediction-circles-100')._data;
                          const circle100Outer = turf.circle([coords.lng, coords.lat], 100, { steps: 64, units: 'miles' });
                          const circle100Inner = turf.circle([coords.lng, coords.lat], 50, { steps: 64, units: 'miles' });
                          circles100Data.features[draggedPointIndex] = turf.polygon([
                              circle100Outer.geometry.coordinates[0],
                              circle100Inner.geometry.coordinates[0]
                          ]);
                          map.getSource('prediction-circles-100').setData(circles100Data);

                          const circles150Data = map.getSource('prediction-circles-150')._data;
                          const circle150Outer = turf.circle([coords.lng, coords.lat], 150, { steps: 64, units: 'miles' });
                          const circle150Inner = turf.circle([coords.lng, coords.lat], 100, { steps: 64, units: 'miles' });
                          circles150Data.features[draggedPointIndex] = turf.polygon([
                              circle150Outer.geometry.coordinates[0],
                              circle150Inner.geometry.coordinates[0]
                          ]);
                          map.getSource('prediction-circles-150').setData(circles150Data);
                      }

                      // Stop dragging
                      function onUp() {
                          draggedPointIndex = null;
                          map.getCanvas().style.cursor = '';
                          map.off('mousemove', onMove);
                      }

                      map.on('mouseenter', 'prediction-points-layer', () => {
                          if (draggedPointIndex === null) map.getCanvas().style.cursor = 'pointer';
                      });
                      map.on('mouseleave', 'prediction-points-layer', () => {
                          if (draggedPointIndex === null) map.getCanvas().style.cursor = '';
                      });
                  })
                .catch(error => console.error('Error loading tornado data:', error));
        });

        mapDiv.dataset.initialized = 'true'; // Mark as initialized
        window.predictionMap = map; // Store map globally for reuse
    }
    // } else {
    //     // Reset guesses and UI
    //     userGuesses = [];
    //     map.getSource('prediction-points').setData({ type: 'FeatureCollection', features: [] });
    //     map.getSource('prediction-circles-50').setData({ type: 'FeatureCollection', features: [] });
    //     map.getSource('prediction-circles-100').setData({ type: 'FeatureCollection', features: [] });
    //     map.getSource('prediction-circles-150').setData({ type: 'FeatureCollection', features: [] });
    //     map.getSource('tornadoes').setData({ type: 'FeatureCollection', features: [] });
    //     // window.guessInfo.innerHTML = `Min circles needed: ${minCircles}<br>Guesses remaining: ${minCircles}`;
    //     // document.getElementById('submit-forecast-btn').style.display = 'none';
    // }
}

function submitForecast() {
    const map = window.predictionMap;
    const tornadoFeatures = window.tornadoData;
    const tornadoPoints = tornadoFeatures.map(f => f.geometry.coordinates);

    // Show tornadoes
    map.getSource('tornadoes').setData({
        type: 'FeatureCollection',
        features: tornadoFeatures
    });

    // Calculate points for each tornado
    const tornadoScores = new Map(); // Map to store max score per tornado index
    userGuesses.forEach(guess => {
        tornadoPoints.forEach((tornado, index) => {
            const distance = turf.distance(tornado, guess, { units: 'miles' });
            let score = 0;
            if (distance <= 50) {
                score = 3; // Within 50 mi radius
            } else if (distance <= 100) {
                score = 2; // Within 100 mi ring (50-100 mi)
            } else if (distance <= 150) {
                score = 1; // Within 150 mi ring (100-150 mi)
            }

            // Update max score for this tornado
            if (score > (tornadoScores.get(index) || 0)) {
                tornadoScores.set(index, score);
            }
        });
    });

    // Sum total points and count covered tornadoes
    let totalPoints = 0;
    const coveredTornadoes = new Set();
    tornadoScores.forEach((score, index) => {
        if (score > 0) {
            totalPoints += score;
            coveredTornadoes.add(index);
        }
    });

    const totalTornadoes = tornadoPoints.length;
    const coveredCount = coveredTornadoes.size;
    const percentage = parseInt((totalPoints / (totalTornadoes * 3)) * 100)

    // Determine result message
    let resultMessage;
    if (percentage === 0) {
        resultMessage = "BUST";
    } else if (percentage < 50) {
        resultMessage = 'Not Bad, Not Great';
    } else if (percentage < 100) {
        resultMessage = 'Nice Forecast';
    } else {
        resultMessage = "Perfect Forecast!";
    }

    // Build results text
    const resultText = `
        <h2>${resultMessage}</h2>
        <p>Your Score: ${percentage}%</p>
        <p>${totalPoints} / ${totalTornadoes * 3} Possible Points</p>
        <p>The day in question is ${formattedDate}</p>
    `;

    // <p>Scoring: 3 pts (within 50 mi), 2 pts (50-100 mi), 1 pt (100-150 mi)</p>

    // Show results modal
    document.getElementById('results-text').innerHTML = resultText;
    document.getElementById('results-modal').style.display = 'flex';
}

function hideResultsModal() {
    document.getElementById('results-modal').style.display = 'none';
}

// Greedy algorithm to calculate minimum number of 100-mile circles
function calculateMinCircles(points, radius) {
    if (points.length === 0) return 0;

    let uncovered = [...points];
    let circleCount = 0;
    const usedCenters = [];

    while (uncovered.length > 0) {
        let bestCenter = null;
        let maxCovered = 0;
        let bestCoveredIndices = [];

        // Test each uncovered point as a center
        for (const candidate of uncovered) {
            const coveredIndices = uncovered.map((p, i) =>
                turf.distance(candidate, p, { units: 'miles' }) <= radius ? i : -1
            ).filter(i => i !== -1);
            if (coveredIndices.length > maxCovered) {
                maxCovered = coveredIndices.length;
                bestCenter = candidate;
                bestCoveredIndices = coveredIndices;
            }
        }

        // Test midpoints between pairs for potentially better coverage
        for (let i = 0; i < uncovered.length; i++) {
            for (let j = i + 1; j < uncovered.length; j++) {
                const p1 = uncovered[i];
                const p2 = uncovered[j];
                const mid = [
                    (p1[0] + p2[0]) / 2,
                    (p1[1] + p2[1]) / 2
                ];
                const coveredIndices = uncovered.map((p, k) =>
                    turf.distance(mid, p, { units: 'miles' }) <= radius ? k : -1
                ).filter(k => k !== -1);
                if (coveredIndices.length > maxCovered) {
                    maxCovered = coveredIndices.length;
                    bestCenter = mid;
                    bestCoveredIndices = coveredIndices;
                }
            }
        }

        if (!bestCenter) break; // No more coverage possible

        usedCenters.push(bestCenter);
        uncovered = uncovered.filter((_, i) => !bestCoveredIndices.includes(i));
        circleCount++;
    }

    // Optional: Log centers for debugging
    console.log(`Centers used (${circleCount}):`, usedCenters);
    return circleCount;
}

function hidePredictionMap() {
    const modal = document.getElementById('map-modal');
    modal.style.display = 'none'; // Hide the modal
}

// Helper function to format date as YYMMDD
function formatDate(date, src) {
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    if (src == 'spc_report') {
      return `${year.slice(-2)}${month}${day}`;
    } else {
      return `${year}${month}${day}`;
    }
}

// Helper function to get random date within range
function getRandomDate() {
    const now = new Date(Date.UTC(2025, 1, 24)); // Fixed to Feb 24, 2025, for consistency (today's date per your setup)
    const daysSinceBase = Math.floor((now - BASE_DATE) / (1000 * 60 * 60 * 24));
    const randomDays = Math.floor(Math.random() * (daysSinceBase + 1)); // Include full range
    const randomDate = new Date(BASE_DATE.getTime()); // Create a new instance
    randomDate.setUTCDate(randomDate.getUTCDate() + randomDays);

    // Set to 12:00 UTC
    randomDate.setUTCHours(12, 0, 0, 0);

    // Debugging: Check if date is valid
    if (isNaN(randomDate.getTime())) {
        console.error("Invalid date generated:", randomDate);
        return null;
    }
    return randomDate;
}

function formatDateReadable(date) {
  console.log(date)
    if (!date || isNaN(date.getTime())) return "Invalid Date";

    const options = {
        weekday: 'long',  // e.g., "Friday"
        month: 'long',    // e.g., "March"
        day: 'numeric',   // e.g., "2"
        year: 'numeric'   // e.g., "2020"
    };

    return new Intl.DateTimeFormat('en-US', options).format(date);
}

// Check if date meets criteria
async function isValidTornadoDay(date, difficulty) {
    if (!date || !MONTHS.includes(date.getUTCMonth())) return false;

    const datetag = formatDate(date, 'spc_report');
    selectedDatetag = datetag; // Store the datetag for later use

    const url = `${SPC_REPORTS_URL}${datetag}_rpts_torn.csv`;

    try {
        const response = await fetch(url);
        if (!response.ok) return false;

        const text = await response.text();
        const lines = text.trim().split('\n').slice(1); // Skip header
        const times = lines.map(line => {
            const parts = line.split(',');
            return parseInt(parts[1]) || 0; // Time column
        }).filter(time => time >= 1500 || time < 300); // Chaseable times

        const count = times.length;
        if (difficulty === 'None') return count > 0;
        if (difficulty === 'Easy') return count >= 10;
        if (difficulty === 'Normal') return count >= 2 && count <= 9;
        if (difficulty === 'Hard') return count === 1;
        return false;
    } catch (error) {
        console.error('Error fetching reports:', error);
        return false;
    }
}

async function generateTornadoDay() {
    const difficulty = document.getElementById('difficulty').value;
    let valid = false;
    let selectedDate;

    let attempts = 0;
    const maxAttempts = 100;
    while (!valid && attempts < maxAttempts) {
        selectedDate = getRandomDate();
        if (!selectedDate) {
            console.error("getRandomDate returned null");
            attempts++;
            continue;
        }
        valid = await isValidTornadoDay(selectedDate, difficulty);
        attempts++;
    }

    if (!valid) {
        alert("Couldn’t find a valid tornado day after " + maxAttempts + " attempts. Try adjusting difficulty.");
        return;
    } else {
      formattedDate = formatDateReadable(selectedDate)
    }

    const dateStr = `${selectedDate.getUTCMonth() + 1}/${selectedDate.getUTCDate()}/${selectedDate.getUTCFullYear()}`;
    // document.getElementById('random-date').textContent = dateStr;

    const mapContainer = document.getElementById('map-container');
    mapContainer.innerHTML = '';
    const datetag = formatDate(selectedDate);
    // selectedDatetag = datetag; // Store the datetag for later use

    mapUrls = [];
    MAPS.forEach(map => {
        const url = `${MA_ARCHIVE_URL}${datetag}/12_${map}.gif`;
        mapUrls.push(url);

        const img = document.createElement('img');
        img.src = url;
        img.alt = `${map} map for ${dateStr}`;
        // img.onerror = () => img.src = 'placeholder.png';
        mapContainer.appendChild(img);
    });

    currentMapIndex = 0;
    document.getElementById('prediction-section').style.display = 'block';
    document.getElementById('large-map').src = mapUrls[currentMapIndex];
    document.getElementById('large-map-container').style.display = 'block'

    // Reset the map state
    const mapDiv = document.getElementById('map');
    if (mapDiv.dataset.initialized) {
        window.predictionMap.remove(); // Remove the existing map instance
        delete mapDiv.dataset.initialized; // Clear initialization flag
        delete window.predictionMap; // Remove global reference
        delete window.tornadoData; // Clear stored tornado data
        delete window.guessInfo; // Clear guess info control reference
        userGuesses = []; // Reset guesses
        document.getElementById('map-modal').style.display = 'none'; // Hide map modal if open
        document.getElementById('results-modal').style.display = 'none'; // Hide results modal if open
        document.getElementById('submit-forecast-btn').style.display = 'none'; // Hide submit button
    }
}

generateTornadoDay()
