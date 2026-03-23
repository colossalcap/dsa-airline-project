import random
import time
import heapq
from collections import deque
from utils.data_store import flight_graph, airport_names, coords_dict

def quick_sort(arr, key_func):
    """Quick Sort implementation using randomized pivot (Lomuto partition)."""
    partition_count = [0]
    comparison_count = [0]

    def _partition(items, low, high):
        rand_idx = random.randint(low, high)
        items[rand_idx], items[high] = items[high], items[rand_idx]

        pivot = key_func(items[high])
        i = low - 1
        for j in range(low, high):
            comparison_count[0] += 1
            if key_func(items[j]) <= pivot:
                i += 1
                items[i], items[j] = items[j], items[i]
        items[i + 1], items[high] = items[high], items[i + 1]
        partition_count[0] += 1
        return i + 1

    def _quick_sort_recursive(items, low, high):
        if low < high:
            pi = _partition(items, low, high)
            _quick_sort_recursive(items, low, pi - 1)
            _quick_sort_recursive(items, pi + 1, high)

    print(f"  [QUICK SORT] Starting sort on {len(arr)} items...")
    t_start = time.time()
    if len(arr) > 1:
        _quick_sort_recursive(arr, 0, len(arr) - 1)
    elapsed = (time.time() - t_start) * 1000
    print(f"  [QUICK SORT] Completed: {partition_count[0]} partitions, {comparison_count[0]} comparisons in {elapsed:.2f}ms")
    return arr



def find_optimal_route(start_iata, end_iata, criteria='time'):
    print(f"  [DIJKSTRA] Running Dijkstra's algorithm: {start_iata} -> {end_iata} (criteria: {criteria})")
    t_start = time.time()
    queue = [(0, start_iata, [start_iata], 0, 0, 0)]
    visited = set()
    nodes_explored = 0
    
    while queue:
        cost, current, path, tot_time, tot_dist, tot_price = heapq.heappop(queue)
        
        if current in visited:
            continue
        visited.add(current)
        nodes_explored += 1
        
        if current == end_iata:
            elapsed = (time.time() - t_start) * 1000
            print(f"  [DIJKSTRA] Route FOUND! Explored {nodes_explored} nodes in {elapsed:.2f}ms")
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
    elapsed = (time.time() - t_start) * 1000
    print(f"  [DIJKSTRA] No route found after exploring {nodes_explored} nodes in {elapsed:.2f}ms")
    return None, 0, 0, 0

def dijkstra_for_yens(start_iata, end_iata, ignored_nodes, ignored_edges, criteria='price'):
    """Modified Dijkstra for Yen's Algorithm that ignores specific nodes and edges."""
    queue = [(0, start_iata, [start_iata], 0, 0, 0)]
    visited = set()
    
    while queue:
        cost, current, path, tot_time, tot_dist, tot_price = heapq.heappop(queue)
        
        if current == end_iata:
            return path, tot_time, tot_dist, tot_price
            
        if current in visited:
            continue
        visited.add(current)
        
        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor in ignored_nodes: continue
                if (current, neighbor) in ignored_edges: continue
                if neighbor in visited: continue
                
                if criteria == 'time': weight = dur
                elif criteria == 'distance': weight = dist
                elif criteria == 'price': weight = price
                else: weight = price
                
                heapq.heappush(queue, (
                    cost + weight, neighbor, path + [neighbor], 
                    tot_time + dur, tot_dist + dist, tot_price + price
                ))
    return None, 0, 0, 0

def find_alternative_routes_yens(start, end, max_connections=3, K=10):
    """Yen's Algorithm (K-Shortest Paths)."""
    print(f"  [YEN] Starting Yen's Algorithm: {start} -> {end} (Top {K} routes, max {max_connections} connections)")
    t_start = time.time()
    
    A = []
    B = []
    B_paths = set()
    
    path, tot_time, tot_dist, tot_price = dijkstra_for_yens(start, end, set(), set(), criteria='price')
    if not path:
        return []
        
    # Re-applying bug fix: Must append root path to A even if it exceeds max_connections, 
    # to serve as a valid seed for spur branches!
    A.append({
        "path": path,
        "total_time": tot_time,
        "total_distance": round(tot_dist, 2),
        "total_price": round(tot_price, 2)
    })
        
    for k in range(1, K):
        if k-1 >= len(A):
            break 
            
        for i in range(len(A[k-1]["path"]) - 1):
            spur_node = A[k-1]["path"][i]
            root_path = A[k-1]["path"][:i+1]
            
            ignored_edges = set()
            for p_dict in A:
                p = p_dict["path"]
                if len(p) > i and p[:i+1] == root_path:
                    ignored_edges.add((p[i], p[i+1]))
                    
            ignored_nodes = set(root_path[:-1])
            
            spur_path, _, _, _ = dijkstra_for_yens(spur_node, end, ignored_nodes, ignored_edges, criteria='price')
            
            if spur_path:
                total_path = root_path[:-1] + spur_path
                
                if len(total_path) - 2 > max_connections:
                    continue
                    
                t_time, t_dist, t_price = 0, 0.0, 0.0
                valid_path = True
                
                for j in range(len(total_path)-1):
                    u = total_path[j]
                    v = total_path[j+1]
                    edge_found = False
                    for neighbor, dur, dist, price in flight_graph.get(u, []):
                        if neighbor == v:
                            t_time += dur
                            t_dist += dist
                            t_price += price
                            edge_found = True
                            break
                    if not edge_found:
                        valid_path = False
                        break
                        
                if valid_path:
                    path_tuple = tuple(total_path)
                    if path_tuple not in B_paths:
                        B.append({
                            "path": total_path,
                            "total_time": t_time,
                            "total_distance": round(t_dist, 2),
                            "total_price": round(t_price, 2),
                            "cost": t_price 
                        })
                        B_paths.add(path_tuple)
                        
        if not B:
            break
            
        B.sort(key=lambda x: x["cost"])
        best_new_path = B.pop(0)
        B_paths.remove(tuple(best_new_path["path"]))
        
        best_new_path_clean = {k: v for k, v in best_new_path.items() if k != 'cost'}
        A.append(best_new_path_clean)
        
    elapsed = (time.time() - t_start) * 1000
    print(f"  [YEN] Found {len(A)} alternative routes in {elapsed:.2f}ms")
    
    # Filter by max_connections here at the very end and sort correctly!
    valid_routes = [r for r in A if (len(r["path"]) - 2) <= max_connections]
    valid_routes.sort(key=lambda r: r["total_price"])
    return valid_routes

def find_reachable_airports_bfs(start, max_stops=2):
    print(f"  [BFS] Starting BFS from '{start}' with max {max_stops} stops")
    t_start = time.time()

    reachable = {}
    visited = {start}
    nodes_dequeued = 0

    queue = deque()
    queue.append((start, 0))

    while queue:
        current, depth = queue.popleft()
        nodes_dequeued += 1

        if depth > max_stops:
            break

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    next_depth = depth + 1
                    if next_depth <= max_stops:
                        if next_depth not in reachable:
                            reachable[next_depth] = []
                        reachable[next_depth].append({
                            "iata": neighbor,
                            "name": airport_names.get(neighbor, neighbor)
                        })
                        queue.append((neighbor, next_depth))

    elapsed = (time.time() - t_start) * 1000
    total_found = sum(len(v) for v in reachable.values())
    print(f"  [BFS] Dequeued {nodes_dequeued} nodes, visited {len(visited)} airports")
    return reachable

def plan_multi_city_route(itinerary, criteria='price'):
    """Chains Dijkstra's algorithm to calculate a continuous path through multiple cities."""
    print(f"  [MULTI-CITY] Planning route: {' -> '.join(itinerary)} (criteria: {criteria})")
    t_start = time.time()
    
    full_path = []
    total_time = 0
    total_distance = 0.0
    total_price = 0.0
    
    for i in range(len(itinerary) - 1):
        start = itinerary[i]
        end = itinerary[i+1]
        
        path, t_time, t_dist, t_price = find_optimal_route(start, end, criteria)
        
        if not path:
            print(f"  [MULTI-CITY] Failed to find route between {start} and {end}")
            return None, 0, 0, 0
            
        if full_path:
            full_path.extend(path[1:])
        else:
            full_path.extend(path)
            
        total_time += t_time
        total_distance += t_dist
        total_price += t_price
        
    elapsed = (time.time() - t_start) * 1000
    print(f"  [MULTI-CITY] Completed in {elapsed:.2f}ms")
    
    return full_path, total_time, round(total_distance, 2), round(total_price, 2)