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

                      // Prediction sources and layers
                      map.addSource('prediction-points', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] }
                      });

                      map.addSource('prediction-circles', {
                          type: 'geojson',
                          data: { type: 'FeatureCollection', features: [] }
                      });

                      map.addLayer({
                          id: 'prediction-points-layer',
                          type: 'circle',
                          source: 'prediction-points',
                          paint: {
                              'circle-radius': 6,
                              'circle-color': '#000000'
                          }
                      });

                      map.addLayer({
                          id: 'prediction-circles-layer',
                          type: 'fill',
                          source: 'prediction-circles',
                          paint: {
                              'fill-color': '#000000',
                              'fill-opacity': 0.2
                          }
                      });

                      // Calculate minimum circles
                      const tornadoPoints = tornadoFeatures.map(f => f.geometry.coordinates);
                      minCircles = calculateMinCircles(tornadoPoints, 100);
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
                          const circle = turf.circle([coords.lng, coords.lat], 100, { steps: 64, units: 'miles' });

                          userGuesses.push([coords.lng, coords.lat]);
                          const pointsData = map.getSource('prediction-points')._data;
                          pointsData.features.push(pointFeature);
                          map.getSource('prediction-points').setData(pointsData);

                          const circlesData = map.getSource('prediction-circles')._data;
                          circlesData.features.push(circle);
                          map.getSource('prediction-circles').setData(circlesData);

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

                          const circlesData = map.getSource('prediction-circles')._data;
                          circlesData.features[draggedPointIndex] = turf.circle([coords.lng, coords.lat], 100, { steps: 64, units: 'miles' });
                          map.getSource('prediction-circles').setData(circlesData);
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
    } else {
        // Reset guesses and UI
        userGuesses = [];
        map.getSource('prediction-points').setData({ type: 'FeatureCollection', features: [] });
        map.getSource('prediction-circles').setData({ type: 'FeatureCollection', features: [] });
        map.getSource('tornadoes').setData({ type: 'FeatureCollection', features: [] });
        // window.guessInfo.innerHTML = `Min circles needed: ${minCircles}<br>Guesses remaining: ${minCircles}`;
        document.getElementById('submit-forecast-btn').style.display = 'none';
    }
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

    // Check coverage
    const coveredTornadoes = new Set();
    userGuesses.forEach(guess => {
        tornadoPoints.forEach((tornado, index) => {
            if (turf.distance(tornado, guess, { units: 'miles' }) <= 100) {
                coveredTornadoes.add(index);
            }
        });
    });

    const totalTornadoes = tornadoPoints.length;
    const coveredCount = coveredTornadoes.size;

    // Determine result message
    let resultMessage;
    if (coveredCount === 0) {
        resultMessage = "❌ BUST ❌";
    } else if (coveredCount < totalTornadoes) {
        resultMessage = '🌪️ Not bad 🌪️';
    } else {
        resultMessage = "🚨 Perfect chase 🚨";
    }

    // Build results text
    const resultText = `
        <h2>${resultMessage}</h2>
        <p>You identified ${coveredCount} out of ${totalTornadoes} tornadoes.</p>
        <p>The day in question is ${formattedDate}</p>
    `;

    // Show results modal
    document.getElementById('results-text').innerHTML = resultText;
    document.getElementById('results-modal').style.display = 'flex';
}

function hideResultsModal() {
    document.getElementById('results-modal').style.display = 'none';
}

// Greedy algorithm to calculate minimum number of 50-mile circles
function calculateMinCircles(points, radius) {
    if (points.length === 0) return 0;

    let uncovered = [...points];
    let circleCount = 0;

    while (uncovered.length > 0) {
        // Find the point that covers the most uncovered points
        let bestCenter = null;
        let maxCovered = 0;

        for (const candidate of uncovered) {
            const covered = uncovered.filter(p =>
                turf.distance(candidate, p, { units: 'miles' }) <= radius
            ).length;
            if (covered > maxCovered) {
                maxCovered = covered;
                bestCenter = candidate;
            }
        }

        // Remove covered points
        uncovered = uncovered.filter(p =>
            turf.distance(bestCenter, p, { units: 'miles' }) > radius
        );
        circleCount++;
    }

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

    let test = new Intl.DateTimeFormat('en-US', options).format(date);
    console.log(test)
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
    const maxAttempts = 50;
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
    document.getElementById('large-map').src = mapUrls[currentMapIndex];
    document.getElementById('large-map-container').style.display = 'block'
}
