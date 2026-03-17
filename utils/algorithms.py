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

def binary_search(sorted_list, target):
    """Binary Search implementation to find a target IATA code."""
    low = 0
    high = len(sorted_list) - 1
    steps = 0
    print(f"  [BINARY SEARCH] Searching for '{target}' in {len(sorted_list)} sorted items...")
    while low <= high:
        mid = (low + high) // 2
        steps += 1
        print(f"    Step {steps}: low={low}, mid={mid}, high={high} | Comparing '{sorted_list[mid]}' with '{target}'")
        if sorted_list[mid] == target:
            print(f"  [BINARY SEARCH] FOUND '{target}' at index {mid} in {steps} steps")
            return mid
        elif sorted_list[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    print(f"  [BINARY SEARCH] '{target}' NOT FOUND after {steps} steps")
    return -1

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
            print(f"  [DIJKSTRA] Path: {' -> '.join(path)}")
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

def find_all_routes_dfs(start, end, max_connections=3):
    all_routes = []
    recursion_calls = [0]
    backtracks = [0]

    def dfs_backtrack(current, destination, path, visited, tot_time, tot_dist, tot_price):
        recursion_calls[0] += 1

        if current == destination:
            all_routes.append({
                "path": list(path),
                "total_time": tot_time,
                "total_distance": round(tot_dist, 2),
                "total_price": round(tot_price, 2)
            })
            return

        if len(path) - 1 >= max_connections:
            return

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    path.append(neighbor)

                    dfs_backtrack(neighbor, destination, path, visited,
                                  tot_time + dur, tot_dist + dist, tot_price + price)

                    path.pop()
                    visited.discard(neighbor)
                    backtracks[0] += 1

    print(f"  [DFS] Starting DFS with Backtracking: {start} -> {end} (max {max_connections} connections)")
    t_start = time.time()
    visited_set = {start}
    dfs_backtrack(start, end, [start], visited_set, 0, 0, 0)
    elapsed = (time.time() - t_start) * 1000

    print(f"  [DFS] Explored {recursion_calls[0]} recursive calls, {backtracks[0]} backtracks")
    print(f"  [DFS] Found {len(all_routes)} routes in {elapsed:.2f}ms")

    all_routes.sort(key=lambda r: r["total_price"])
    return all_routes

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
    for level, airports in sorted(reachable.items()):
        print(f"    Level {level}: {len(airports)} airports reachable")
    print(f"  [BFS] Total reachable: {total_found} airports in {elapsed:.2f}ms")
    return reachable
