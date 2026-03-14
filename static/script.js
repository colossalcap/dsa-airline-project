let map, markers = [], routeLine = null;
let currentRoutesData = {}; 
let globalAirports = []; 
let tempStartMarker = null; 
let tempEndMarker = null;   

window.onload = async function() {
    initMap();
    await loadAirportOptions();
    setupInputListeners();
};

function initMap() {
    map = L.map('map').setView([20, 0], 2);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', handleMapClick);
}

function clearMap() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;
    
    if (tempStartMarker) map.removeLayer(tempStartMarker);
    if (tempEndMarker) map.removeLayer(tempEndMarker);
}

function resetRouteDisplay() {
    document.getElementById('resultCard').style.display = 'none';
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function showError(msg) {
    document.getElementById('errorMsg').innerText = msg;
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('resultCard').style.display = 'none';
    clearMap();
}

function hideError() {
    document.getElementById('errorMsg').style.display = 'none';
}

async function loadAirportOptions() {
    try {
        const res = await fetch('/api/airport_options');
        const data = await res.json();
        
        if (data.code === 1 && Array.isArray(data.options)) {
            globalAirports = data.options; 
            const dataList = document.getElementById('airportList');
            dataList.innerHTML = ''; 
            
            data.options.forEach(option => {
                if (option.value && option.text) { 
                    const opt = document.createElement('option');
                    opt.value = option.text;
                    dataList.appendChild(opt);
                }
            });
        }
    } catch (err) {
        console.error("Load airport options error:", err);
    }
}

function setupInputListeners() {
    document.getElementById('startAirport').addEventListener('input', (e) => handleInputChange(e, 'startAirport'));
    document.getElementById('endAirport').addEventListener('input', (e) => handleInputChange(e, 'endAirport'));
}

function handleInputChange(e, inputId) {
    resetRouteDisplay(); // Hide old routes and results when user starts typing a new airport
    hideError();

    const val = e.target.value;
    const matchedAirport = globalAirports.find(ap => ap.text === val);
    
    if (matchedAirport) {
        const lat = matchedAirport.lat;
        const lng = matchedAirport.lng;
        
        if (inputId === 'startAirport') {
            if (tempStartMarker) map.removeLayer(tempStartMarker);
            tempStartMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-start" style="width:30px; height:30px;">🛫</div>`, className: '' })
            }).addTo(map).bindTooltip("Departure Set", {permanent: true, direction: "top"}).openTooltip();
        } else {
            if (tempEndMarker) map.removeLayer(tempEndMarker);
            tempEndMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-end" style="width:30px; height:30px;">🛬</div>`, className: '' })
            }).addTo(map).bindTooltip("Arrival Set", {permanent: true, direction: "top"}).openTooltip();
        }
        map.flyTo([lat, lng], 5, { duration: 1.5 });
    } else {
        if (inputId === 'startAirport' && tempStartMarker) {
            map.removeLayer(tempStartMarker);
            tempStartMarker = null;
        } else if (inputId === 'endAirport' && tempEndMarker) {
            map.removeLayer(tempEndMarker);
            tempEndMarker = null;
        }
    }
}

// --- SMART RADAR MAP CLICK LOGIC ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI/180);
    const dLon = (lon2 - lon1) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}

function handleMapClick(e) {
    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;
    
    const nearbyAirports = globalAirports.filter(airport => {
        const dist = getDistanceFromLatLonInKm(clickLat, clickLng, airport.lat, airport.lng);
        return dist <= 150; 
    });

    if (nearbyAirports.length === 0) {
        L.popup()
            .setLatLng(e.latlng)
            .setContent("<div style='text-align:center; color:#333;'><b>No airports found within 150km.</b><br>Try clicking closer to a city!</div>")
            .openOn(map);
        return;
    }

    let optionsHtml = nearbyAirports.map(ap => `<option value="${ap.text}" data-lat="${ap.lat}" data-lng="${ap.lng}">${ap.text}</option>`).join('');
    
    let popupContent = `
        <div style="text-align:center; min-width: 200px; color:#333;">
            <b style="color:#001A4D;">${nearbyAirports.length} Airport(s) Nearby</b><br>
            <select id="mapPopupSelect" style="width:100%; margin: 10px 0; padding: 5px; border-radius:3px; color:#333;">
                ${optionsHtml}
            </select>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button onclick="setMapSelection('startAirport')" style="background:#001A4D; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Set From</button>
                <button onclick="setMapSelection('endAirport')" style="background:#FFB81C; color:#001A4D; font-weight:bold; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Set To</button>
            </div>
        </div>
    `;

    L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(map);
}

window.setMapSelection = function(inputId) {
    resetRouteDisplay();
    hideError();

    const selectEl = document.getElementById('mapPopupSelect');
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const selectedText = selectedOption.value;
    const lat = parseFloat(selectedOption.getAttribute('data-lat'));
    const lng = parseFloat(selectedOption.getAttribute('data-lng'));

    document.getElementById(inputId).value = selectedText;
    map.closePopup();
    
    if (inputId === 'startAirport') {
        if (tempStartMarker) map.removeLayer(tempStartMarker);
        tempStartMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-start" style="width:30px; height:30px;">🛫</div>`, className: '' })
        }).addTo(map).bindTooltip("Departure Set", {permanent: true, direction: "top"}).openTooltip();
    } else {
        if (tempEndMarker) map.removeLayer(tempEndMarker);
        tempEndMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-end" style="width:30px; height:30px;">🛬</div>`, className: '' })
        }).addTo(map).bindTooltip("Arrival Set", {permanent: true, direction: "top"}).openTooltip();
    }

    map.flyTo([lat, lng], 5, { duration: 1.5 });

    const inputEl = document.getElementById(inputId);
    inputEl.style.backgroundColor = '#e8f5e9';
    setTimeout(() => inputEl.style.backgroundColor = '', 500);
}

// --- ROUTE QUERY & RENDERING ---
async function queryShortestRoute() {
    hideError();
    
    const startRaw = document.getElementById('startAirport').value;
    const endRaw = document.getElementById('endAirport').value;

    if (!startRaw || !endRaw) {
        showError('Please select both airports!');
        return;
    }

    const extractIATA = (str) => {
        const match = str.match(/\(([A-Z]{3})\)/);
        return match ? match[1] : str.substring(0, 3).toUpperCase();
    };

    const start = extractIATA(startRaw);
    const end = extractIATA(endRaw);

    try {
        const res = await fetch('/api/get_shortest_route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start, end })
        });
        const data = await res.json();

        if (data.code === 0) {
            showError(data.msg);
            return;
        }

        // Clear temporary pins before drawing the actual real route
        clearMap();

        currentRoutesData = data.routes;
        generateDynamicTabs();

        const firstTabCrit = document.querySelector('.tab-btn').dataset.target;
        switchTab(firstTabCrit);
        document.getElementById('resultCard').style.display = 'block';

    } catch (err) {
        showError('Network error. Check Flask server!');
        console.error(err);
    }
}

function generateDynamicTabs() {
    const uniquePaths = {};
    const criteriaNames = {
        'time': 'Fastest',
        'price': 'Cheapest',
        'distance': 'Shortest Distance',
        'connections': 'Fewest Stops'
    };

    for (const crit of ['time', 'price', 'distance', 'connections']) {
        const route = currentRoutesData[crit];
        if (!route) continue;
        const pathStr = route.path.join(',');
        
        if (!uniquePaths[pathStr]) {
            uniquePaths[pathStr] = { criterias: [crit], routeData: route };
        } else {
            uniquePaths[pathStr].criterias.push(crit);
        }
    }

    const tabsContainer = document.getElementById('routeTabs');
    tabsContainer.innerHTML = '';
    const pathKeys = Object.keys(uniquePaths);

    if (pathKeys.length === 1) {
        document.getElementById('bestOverallBadge').style.display = 'block';
        tabsContainer.style.display = 'none';
        const singleCrit = uniquePaths[pathKeys[0]].criterias[0];
        currentRoutesData[singleCrit].groupedTitle = 'Best Overall Itinerary';
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.target = singleCrit;
        tabsContainer.appendChild(btn);
    } else {
        document.getElementById('bestOverallBadge').style.display = 'none';
        tabsContainer.style.display = 'flex';
        for (const pathStr in uniquePaths) {
            const group = uniquePaths[pathStr];
            const tabLabels = group.criterias.map(c => criteriaNames[c]).join(' & ');
            const primaryCrit = group.criterias[0];
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.onclick = () => switchTab(primaryCrit);
            btn.innerText = tabLabels;
            btn.dataset.target = primaryCrit;
            tabsContainer.appendChild(btn);
            group.criterias.forEach(c => {
                currentRoutesData[c].groupedTitle = tabLabels + ' Itinerary';
            });
        }
    }
}

window.switchTab = function(criteria) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-target="${criteria}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const routeData = currentRoutesData[criteria];
    if (!routeData) return;

    document.getElementById('routeTitle').innerText = routeData.groupedTitle;
    document.getElementById('routePath').innerText = routeData.path.join(' → ');
    document.getElementById('totalHours').innerText = Math.floor(routeData.total_time / 60);
    document.getElementById('totalMins').innerText = routeData.total_time % 60;
    document.getElementById('totalDistance').innerText = routeData.total_distance.toLocaleString() + ' km';
    document.getElementById('totalPrice').innerText = '$' + routeData.total_price.toLocaleString(undefined, {minimumFractionDigits: 2});

    // Remove old route layer to draw the new tab's route
    if (routeLine) map.removeLayer(routeLine);
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    
    renderMap(routeData);
}

function renderMap(data) {
    const { path, path_names, coords } = data; 
    const latlngs = [];
    
    path.forEach((iata, index) => {
        const fullName = path_names[index]; 
        const [lat, lng] = coords[iata];
        latlngs.push([lat, lng]);
        
        let markerHtml = '';
        let popupText = '';
        
        if (index === 0) {
            markerHtml = `<div class="premium-marker marker-start" style="width:35px; height:35px;">🛫</div>`;
            popupText = `<b>${fullName}</b><br>Departure Airport`;
        } else if (index === path.length - 1) {
            markerHtml = `<div class="premium-marker marker-end" style="width:35px; height:35px;">🛬</div>`;
            popupText = `<b>${fullName}</b><br>Arrival Airport`;
        } else {
            markerHtml = `<div class="premium-marker marker-layover" style="width:25px; height:25px;">🔵</div>`;
            popupText = `<b>${fullName}</b><br>Layover`;
        }

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({ html: markerHtml, className: '' })
        }).addTo(map).bindPopup(popupText);
        
        markers.push(marker);
    });

    if (typeof L.polyline.antPath === 'function') {
        routeLine = L.polyline.antPath(latlngs, {
            "delay": 400,
            "dashArray": [15, 30],
            "weight": 5,
            "color": "#00E5FF", 
            "pulseColor": "#001A4D", // Changed pulse color slightly to match light map
            "paused": false,
            "reverse": false,
            "hardwareAccelerated": true
        }).addTo(map);
    } else {
        routeLine = L.polyline(latlngs, { color: '#00E5FF', weight: 4 }).addTo(map);
    }
    
    routeLine.bindPopup(`<b>Optimal Route</b><br>Distance: ${data.total_distance}km<br>Price: $${data.total_price}`);
    map.fitBounds(latlngs, { padding: [50, 50] });
}