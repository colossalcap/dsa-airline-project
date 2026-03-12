let map, markers = [], routeLine = null;

// Initialize once page start load
window.onload = async function() {
    initMap();
    await loadAirportOptions();
};

// Initialize map
function initMap() {
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

// Clear map markers/routes
function clearMap() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;
}

// Show error
function showError(msg) {
    document.getElementById('errorMsg').innerText = msg;
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('resultCard').style.display = 'none';
    clearMap();
}

// Hide error
function hideError() {
    document.getElementById('errorMsg').style.display = 'none';
}

// Load airport dropdown options
async function loadAirportOptions() {
    try {
        const res = await fetch('http://localhost:5000/api/airport_options');
        console.log("Airport options response status:", res.status); 
        
        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }
        
        const data = await res.json();
        console.log("Airport options data:", data);
        
        if (data.code === 1 && Array.isArray(data.options) && data.options.length > 0) {
            const startSelect = document.getElementById('startAirport');
            const endSelect = document.getElementById('endAirport');

            startSelect.innerHTML = '<option value="">Select Departure</option>';
            endSelect.innerHTML = '<option value="">Select Arrival</option>';
            
            data.options.forEach(option => {
                if (option.value && option.text) { 
                    const startOpt = document.createElement('option');
                    startOpt.value = option.value;
                    startOpt.text = option.text;
                    startSelect.appendChild(startOpt);
                    
                    const endOpt = document.createElement('option');
                    endOpt.value = option.value;
                    endOpt.text = option.text;
                    endSelect.appendChild(endOpt);
                }
            });
            
            console.log(`Loaded ${data.options.length} airport options`);
        } else {
            alert('No airport data available!');
            console.log("No options found in response");
        }
    } catch (err) {
        alert(`Failed to load airports: ${err.message}`);
        console.error("Load airport options error:", err);
    }
}

// Query shortest path
async function queryShortestRoute() {
    hideError();
    clearMap();
    const start = document.getElementById('startAirport').value;
    const end = document.getElementById('endAirport').value;

    if (!start || !end) {
        showError('Please select both airports!');
        return;
    }

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

        renderResult(data);
        renderMap(data);

    } catch (err) {
        showError('Network error. Check Flask server!');
        console.error(err);
    }
}

// Render shortest path result
function renderResult(data) {
    const card = document.getElementById('resultCard');
    document.getElementById('routePath').innerText = data.path.join(' → ');

    const total_time = data.total_time;
    const hours = Math.floor(total_time / 60);
    const minutes = total_time % 60;

    document.getElementById('totalHours').innerText = hours;
    document.getElementById('totalMins').innerText = minutes;

    card.style.display = 'block';
}

// Render map (markers + route)
function renderMap(data) {
    const { path, coords } = data;
    const latlngs = [];
    path.forEach((iata, index) => {
        const [lat, lng] = coords[iata];
        latlngs.push([lat, lng]);
        // Marker color: red (departure), green (arrival), blue (transfer)
        const color = index === 0 ? '#F53F3F' : (index === path.length-1 ? '#00B42A' : '#165DFF');
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: `<div style="background:${color}; color:white; padding:2px 6px; border-radius:3px; font-size:12px;">${iata}</div>`,
                iconSize: [30, 20]
            })
        }).addTo(map).bindPopup(`<b>${iata}</b><br>${index===0?'Departure':'Arrival'}`);
        markers.push(marker);
    });

    // Draw route line
    routeLine = L.polyline(latlngs, {
        color: '#165DFF',
        weight: 3,
        opacity: 0.7
    }).addTo(map);
    routeLine.bindPopup(`<b>Shortest Route</b><br>Duration: ${data.total_time} mins`);
    map.fitBounds(latlngs, { padding: [50, 50] });
}