from flask import Flask, render_template, request, jsonify
import json
import os

app = Flask(__name__)

# Read JSON data
flight_graph = {}
airport_names = {}  

# Load data + name 
def load_flight_data():
    global flight_graph, airport_names
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
            if not iata:
                continue
            
            if iata not in airport_names:
                display_name = airport.get("display_name", "")
                name = airport.get("name", "")
                if display_name:
                    airport_names[iata] = display_name
                elif name:
                    airport_names[iata] = f"{name} ({iata})"
                else:
                    airport_names[iata] = f"Airport ({iata})"
            
            try:
                lat = float(airport.get("latitude", 0.0))
                lng = float(airport.get("longitude", 0.0))
            except:
                lat, lng = 0.0, 0.0
            
            routes = airport.get("routes", [])
            route_details = []
            for route_obj in routes:
                route_iata = route_obj.get("iata", "").strip()
                duration = route_obj.get("min", 10)
                if not route_iata:
                    continue
                target_airport = flight_data.get(route_iata, {})
                try:
                    target_lat = float(target_airport.get("latitude", lat))
                    target_lng = float(target_airport.get("longitude", lng))
                except:
                    target_lat, target_lng = lat, lng
                route_details.append((route_iata, duration, target_lat, target_lng))
            
            if route_details:
                adjacency_list[iata] = route_details
        
        flight_graph = adjacency_list
        print(f"Loaded {len(flight_graph)} airports, {len(airport_names)} names cached")
    except Exception as e:
        print(f"Load JSON failed: {str(e)}")

load_flight_data()

# Linear Search + Merge Sort
def find_all_routes(start_iata, end_iata):
    all_routes = []
    queue = [(start_iata, [start_iata], 0, {start_iata: (flight_graph[start_iata][0][2], flight_graph[start_iata][0][3])} if start_iata in flight_graph else (0,0))]
    visited = set()
    while queue:
        current, path, total_time, coords = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        if current in flight_graph:
            for neighbor, dur, lat, lng in flight_graph[current]:
                new_path = path + [neighbor]
                new_time = total_time + dur
                new_coords = coords.copy()
                new_coords[neighbor] = (lat, lng)
                if neighbor == end_iata:
                    all_routes.append((new_path, new_time, new_coords))
                elif neighbor not in path:
                    queue.append((neighbor, new_path, new_time, new_coords))
    return all_routes

def merge_sort(routes):
    if len(routes) <= 1:
        return routes
    mid = len(routes) // 2
    left = merge_sort(routes[:mid])
    right = merge_sort(routes[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i][1] <= right[j][1]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result


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
    
    all_routes = find_all_routes(start, end)
    if not all_routes:
        return jsonify({"code": 0, "msg": "No routes found!"})
    
    sorted_routes = merge_sort(all_routes)
    shortest = sorted_routes[0]
    
    result = {
        "code": 1,
        "path": shortest[0],  
        "total_time": shortest[1], 
        "coords": shortest[2]
    }
    return jsonify(result)

# Dropdown menu to show user airport choices
@app.route('/api/airport_options')
def get_airport_options():
    try:
        options = [
            {"value": iata, "text": name} 
            for iata, name in airport_names.items()
            if iata in flight_graph 
        ]
        options.sort(key=lambda x: x["text"])
        print(f"Return {len(options)} airport options")
        return jsonify({"code": 1, "options": options})
    except Exception as e:
        print(f"Airport options failed: {str(e)}")
        return jsonify({"code": 0, "msg": "Failed to load airports"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)