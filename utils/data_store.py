import os
import json
import math

flight_graph = {}
airport_names = {}
coords_dict = {}

# Common hubs used to normalize airport city names
hub_patch = {
    "LHR": "London", "LGW": "London", "STN": "London", "LTN": "London", "LCY": "London",
    "JFK": "New York", "LGA": "New York", "EWR": "New York",
    "HND": "Tokyo", "NRT": "Tokyo", 
    "CDG": "Paris", "ORY": "Paris",
    "DXB": "Dubai", "SIN": "Singapore", "LAX": "Los Angeles", 
    "SFO": "San Francisco", "ORD": "Chicago", "ATL": "Atlanta"
}

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    a = max(0.0, min(1.0, a))
    c = 2 * math.asin(math.sqrt(a))
    return round(R * c, 2)

def load_flight_data():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    data_path = os.path.join(base_dir, "data", "airline_routes.json")
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
        
        flight_graph.clear()
        flight_graph.update(adjacency_list)
        print(f"Loaded {len(flight_graph)} airports with cleaned formatting.")
    except Exception as e:
        print(f"Load JSON failed: {str(e)}")


