let map, markers = [], routeLine = null;
let currentRoutesData = {}; 

window.onload = async function() {
    initMap();
    await loadAirportOptions();
};

function initMap() {
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function clearMap() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;
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

async function queryShortestRoute() {
    hideError();
    clearMap();
    
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
        // All 4 criteria result in the exact same route
        document.getElementById('bestOverallBadge').style.display = 'block';
        tabsContainer.style.display = 'none';

        const singleCrit = uniquePaths[pathKeys[0]].criterias[0];
        currentRoutesData[singleCrit].groupedTitle = 'Best Overall Itinerary';

        // Hidden button so the switchTab logic works seamlessly
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.target = singleCrit;
        tabsContainer.appendChild(btn);

    } else {
        document.getElementById('bestOverallBadge').style.display = 'none';
        tabsContainer.style.display = 'flex';

        for (const pathStr in uniquePaths) {
            const group = uniquePaths[pathStr];
            // E.g., This creates a string like "Fastest & Cheapest"
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

    clearMap();
    renderMap(routeData);
}

function renderMap(data) {
    const { path, path_names, coords } = data; // Pulling in the full path_names from Python
    const latlngs = [];
    
    path.forEach((iata, index) => {
        const fullName = path_names[index]; 
        const [lat, lng] = coords[iata];
        latlngs.push([lat, lng]);
        
        // Determine color and wording based on position in route
        let pointType = 'Layover (Arrival & Departure)';
        let color = '#165DFF'; // Blue for middle stops
        
        if (index === 0) {
            pointType = 'Departure';
            color = '#F53F3F'; // Red for start
        } else if (index === path.length - 1) {
            pointType = 'Arrival';
            color = '#00B42A'; // Green for end
        }

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: `<div style="background:${color}; color:white; padding:2px 6px; border-radius:3px; font-size:12px; white-space:nowrap;">${iata}</div>`,
                iconSize: null
            })
        }).addTo(map).bindPopup(`<b>${fullName}</b><br>${pointType}`);
        
        markers.push(marker);
    });

    routeLine = L.polyline(latlngs, {
        color: '#165DFF',
        weight: 3,
        opacity: 0.7
    }).addTo(map);
    
    routeLine.bindPopup(`<b>Optimal Route</b><br>Distance: ${data.total_distance}km<br>Price: $${data.total_price}`);
    map.fitBounds(latlngs, { padding: [50, 50] });
}