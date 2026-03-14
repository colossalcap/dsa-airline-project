from flask import Flask, render_template, request, jsonify
import json
import os
import math
import heapq

app = Flask(__name__)

flight_graph = {}
airport_names = {}  
coords_dict = {}

# Calculate distance between two lat/lng points in km
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return round(R * c, 2)

def load_flight_data():
    global flight_graph, airport_names, coords_dict
    data_path = os.path.join(os.path.dirname(__file__), "data", "airline_routes.json")
    if not os.path.exists(data_path):
        print(f"JSON file not found: {data_path}")
        return
    
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            flight_data = json.load(f)  
        
        adjacency_list = {}
        
        for iata_code, airport in flight_data.items():
            iata = iata_code.strip()
            if not iata: continue
            
            name = airport.get("name", "").strip()
            city = airport.get("city", "").strip()
            country = airport.get("country", "").strip()
            
            if not city:
                city = name.split(" Airport")[0].split(" International")[0].strip()
            
            hub_patch = {
                "LHR": "London", "LGW": "London", "STN": "London", "LTN": "London", "LCY": "London",
                "JFK": "New York", "LGA": "New York", "EWR": "New York",
                "HND": "Tokyo", "NRT": "Tokyo", 
                "CDG": "Paris", "ORY": "Paris",
                "DXB": "Dubai", "SIN": "Singapore", "LAX": "Los Angeles", 
                "SFO": "San Francisco", "ORD": "Chicago", "ATL": "Atlanta"
            }
            if iata in hub_patch:
                city = hub_patch[iata]
            
            display_country = f", {country}" if country and country.lower() != city.lower() else ""
            
            display_name = name
            if city and display_name.lower().startswith(city.lower()):
                temp_name = display_name[len(city):].strip(' -,')
                invalid_leftovers = ["airport", "intl", "international", "international airport", "regional"]
                if temp_name and temp_name.lower() not in invalid_leftovers:
                    display_name = temp_name
            
            if not display_name:
                display_name = "Airport"

            airport_names[iata] = f"{city} ({iata}) - {display_name}{display_country}"

            try:
                lat = float(airport.get("latitude", 0.0))
                lng = float(airport.get("longitude", 0.0))
            except:
                lat, lng = 0.0, 0.0
            coords_dict[iata] = (lat, lng)

        for iata_code, airport in flight_data.items():
            iata = iata_code.strip()
            if not iata: continue
            
            lat, lng = coords_dict[iata]
            routes = airport.get("routes", [])
            route_details = []
            
            for route_obj in routes:
                route_iata = route_obj.get("iata", "").strip()
                duration = route_obj.get("min", 10)
                if not route_iata or route_iata not in coords_dict: continue
                
                target_lat, target_lng = coords_dict[route_iata]
                
                distance = haversine_distance(lat, lng, target_lat, target_lng)
                price = round(50 + (distance * 0.12) + (duration * 0.05), 2) 
                
                route_details.append((route_iata, duration, distance, price))
            
            if route_details:
                adjacency_list[iata] = route_details
        
        flight_graph = adjacency_list
        print(f"Loaded {len(flight_graph)} airports with cleaned formatting.")
    except Exception as e:
        print(f"Load JSON failed: {str(e)}")

load_flight_data()

# DIJKSTRA'S ALGORITHM
def find_optimal_route(start_iata, end_iata, criteria='time'):
    queue = [(0, start_iata, [start_iata], 0, 0, 0)]
    visited = set()
    
    while queue:
        cost, current, path, tot_time, tot_dist, tot_price = heapq.heappop(queue)
        
        if current in visited:
            continue
        visited.add(current)
        
        if current == end_iata:
            return path, tot_time, tot_dist, tot_price
            
        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    if criteria == 'time': weight = dur
                    elif criteria == 'distance': weight = dist
                    elif criteria == 'price': weight = price
                    elif criteria == 'connections': weight = 1 
                    else: weight = dur
                    
                    heapq.heappush(queue, (
                        cost + weight, 
                        neighbor, 
                        path + [neighbor], 
                        tot_time + dur, 
                        round(tot_dist + dist, 2), 
                        round(tot_price + price, 2)
                    ))
    return None, 0, 0, 0

@app.route('/')
def index():
    return render_template('home.html')

@app.route('/api/get_shortest_route', methods=['POST'])
def get_shortest_route():
    data = request.get_json()
    start = data.get('start', '').upper()
    end = data.get('end', '').upper()
    
    if start not in flight_graph or end not in flight_graph:
        return jsonify({"code": 0, "msg": "Airport IATA not exists!"})
    if start == end:
        return jsonify({"code": 0, "msg": "Departure and arrival cannot be the same!"})
    
    # Calculate all 4 criteria at once
    routes_data = {}
    criteria_list = ['time', 'distance', 'price', 'connections']
    
    for crit in criteria_list:
        path, tot_time, tot_dist, tot_price = find_optimal_route(start, end, crit)
        if path:
            routes_data[crit] = {
                "path": path,  
                "path_names": [airport_names[iata] for iata in path], # NEW: Full names for the map
                "total_time": tot_time, 
                "total_distance": tot_dist,
                "total_price": tot_price,
                "coords": {iata: coords_dict[iata] for iata in path}
            }
            
    if not routes_data:
        return jsonify({"code": 0, "msg": "No route found between these airports!"})
    
    return jsonify({"code": 1, "routes": routes_data})

@app.route('/api/airport_options')
def get_airport_options():
    try:
        options = []
        for iata, name in airport_names.items():
            if iata in flight_graph:
                lat, lng = coords_dict.get(iata, (0, 0))
                options.append({
                    "value": iata, 
                    "text": name,
                    "lat": lat,
                    "lng": lng
                })
                
        options.sort(key=lambda x: x["text"])
        return jsonify({"code": 1, "options": options})
    except Exception as e:
        return jsonify({"code": 0, "msg": "Failed to load airports"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)