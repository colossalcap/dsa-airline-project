"""
Dijkstra's Algorithm service.
Provides optimal route finding functionality using a custom MinHeap implementation.
Supports finding paths based on different criteria (time, distance, price).
"""
import time
from app.services.data_store import flight_graph

class MinHeap:
    """A minimal binary heap implementation for priority queue operations."""

    def __init__(self):
        self.heap = []

    def push(self, element):
        """Add an element to the heap while maintaining the heap property."""
        self.heap.append(element)
        self._bubble_up(len(self.heap) - 1)

    def pop(self):
        """Remove and return the smallest element from the heap."""
        if not self.heap:
            raise IndexError("pop from an empty heap")
        if len(self.heap) == 1:
            return self.heap.pop()
        
        root = self.heap[0]
        self.heap[0] = self.heap.pop()
        self._bubble_down(0)
        return root

    def _bubble_up(self, index):
        """Move the element at 'index' up to its correct position."""
        while index > 0:
            parent = (index - 1) // 2
            if self.heap[index] < self.heap[parent]:
                self.heap[index], self.heap[parent] = self.heap[parent], self.heap[index]
                index = parent
            else:
                break

    def _bubble_down(self, index):
        """Move the element at 'index' down to its correct position."""
        while True:
            left = 2 * index + 1
            right = 2 * index + 2
            smallest = index

            if left < len(self.heap) and self.heap[left] < self.heap[smallest]:
                smallest = left
            if right < len(self.heap) and self.heap[right] < self.heap[smallest]:
                smallest = right

            if smallest != index:
                self.heap[index], self.heap[smallest] = self.heap[smallest], self.heap[index]
                index = smallest
            else:
                break

    def __len__(self):
        return len(self.heap)

    def __bool__(self):
        return len(self.heap) > 0


def _reconstruct_path(predecessors, end):
    """Backtracks from end node to start node using the predecessors dictionary."""
    path = []
    curr = end
    while curr is not None:
        path.append(curr)
        curr = predecessors.get(curr)
    return path[::-1]


def find_optimal_route(start_iata, end_iata, criteria='time'):
    """Dijkstra's algorithm to find the optimal route between two airports."""
    print(f"  [DIJKSTRA] Running Dijkstra's algorithm: {start_iata} -> {end_iata} (criteria: {criteria})")
    t_start = time.time()
    
    heap = MinHeap()
    push_count = 0  # Tie-breaker to prevent string/float comparisons in the heap

    # Tuple format: (cost, push_count, current, tot_time, tot_dist, tot_price)
    heap.push((0, push_count, start_iata, 0, 0, 0))
    push_count += 1
    
    best_costs = {start_iata: 0}
    predecessors = {start_iata: None}
    nodes_explored = 0

    # OPTIMIZATION 1: Map the criteria to the correct edge index BEFORE the loop.
    # flight_graph edges look like: (neighbor, dur, dist, price)
    # Indices:                       0         1    2     3
    if criteria == 'time':
        weight_idx = 1
    elif criteria == 'distance':
        weight_idx = 2
    elif criteria == 'price':
        weight_idx = 3
    elif criteria == 'connections':
        weight_idx = None
    else:
        weight_idx = 1  # Default fallback

    while heap:
        # Ignore the push_count (_) when popping
        cost, _, current, tot_time, tot_dist, tot_price = heap.pop()

        if cost > best_costs.get(current, float('inf')):
            continue
            
        nodes_explored += 1

        if current == end_iata:
            elapsed = (time.time() - t_start) * 1000
            print(f"  [DIJKSTRA] Route FOUND! Explored {nodes_explored} nodes in {elapsed:.2f}ms")
            
            # Reconstruct the optimal path by tracking predecessors backwards
            path = _reconstruct_path(predecessors, end_iata)
            
            # OPTIMIZATION 2: Apply float rounding only once at the very end
            return path, tot_time, round(tot_dist, 2), round(tot_price, 2)

        if current in flight_graph:
            # Iterate through edges directly to use the index dynamically
            for edge in flight_graph[current]:
                neighbor, dur, dist, price = edge
                
                # Fast inline evaluation instead of a chained if/elif block
                # Weight becomes 1 if criteria is 'connections', else take the specified edge attribute
                weight = 1 if weight_idx is None else edge[weight_idx]

                new_cost = cost + weight
                
                # If we found a strictly cheaper way to reach the neighbor, update it
                if new_cost < best_costs.get(neighbor, float('inf')):
                    best_costs[neighbor] = new_cost
                    predecessors[neighbor] = current
                    
                    heap.push((
                        new_cost,
                        push_count, # Unique integer solves the heap tie-breaker overhead
                        neighbor,
                        tot_time + dur,
                        tot_dist + dist,   # Raw float, no rounding
                        tot_price + price  # Raw float, no rounding
                    ))
                    push_count += 1

    elapsed = (time.time() - t_start) * 1000
    print(f"  [DIJKSTRA] No route found after exploring {nodes_explored} nodes in {elapsed:.2f}ms")
    return None, 0, 0, 0


def dijkstra_for_yens(start_iata, end_iata, ignored_nodes, ignored_edges, criteria='price'):
    """Modified Dijkstra for Yen's Algorithm that ignores specific nodes and edges."""
    heap = MinHeap()
    push_count = 0
    
    heap.push((0, push_count, start_iata, 0, 0, 0))
    push_count += 1
    
    best_costs = {start_iata: 0}
    predecessors = {start_iata: None}

    # Setup the weight index map outside the loop
    if criteria == 'time':
        weight_idx = 1
    elif criteria == 'distance':
        weight_idx = 2
    elif criteria == 'price':
        weight_idx = 3
    elif criteria == 'connections':
        weight_idx = None
    else:
        weight_idx = 3 # Default fallback to price for Yen's

    while heap:
        cost, _, current, tot_time, tot_dist, tot_price = heap.pop()

        if cost > best_costs.get(current, float('inf')):
            continue

        if current == end_iata:
            # Reconstruct the path once the destination is extracted from the heap
            path = _reconstruct_path(predecessors, end_iata)
            # Delayed rounding
            return path, tot_time, round(tot_dist, 2), round(tot_price, 2)

        if current in flight_graph:
            for edge in flight_graph[current]:
                neighbor, dur, dist, price = edge
                
                # Exclude specific nodes that overlap with the root path we are branching from
                if neighbor in ignored_nodes:
                    continue
                    
                # Exclude the specific edge that we are branching from
                if (current, neighbor) in ignored_edges:
                    continue

                weight = 1 if weight_idx is None else edge[weight_idx]

                new_cost = cost + weight
                if new_cost < best_costs.get(neighbor, float('inf')):
                    best_costs[neighbor] = new_cost
                    predecessors[neighbor] = current
                    
                    heap.push((
                        new_cost, 
                        push_count,
                        neighbor,
                        tot_time + dur, 
                        tot_dist + dist, 
                        tot_price + price
                    ))
                    push_count += 1
                    
    return None, 0, 0, 0