import time
from app.services.data_store import flight_graph


class MinHeap:
    """Min-Heap (priority queue) implemented with a dynamic array.

    Elements are compared using the ``<`` operator, so tuples are
    ordered lexicographically (first element = priority).  This gives
    the same behaviour as Python's ``heapq`` module without importing it.
    """

    def __init__(self):
        self._data = []

    # ---- public API ------------------------------------------------

    def push(self, item):
        """Add *item* to the heap, maintaining the heap invariant."""
        self._data.append(item)
        self._sift_up(len(self._data) - 1)

    def pop(self):
        """Remove and return the smallest item.

        Raises ``IndexError`` if the heap is empty.
        """
        if not self._data:
            raise IndexError("pop from an empty heap")
        # Move the last element to the root, then sift down
        self._swap(0, len(self._data) - 1)
        smallest = self._data.pop()
        if self._data:
            self._sift_down(0)
        return smallest

    def __bool__(self):
        return len(self._data) > 0

    def __len__(self):
        return len(self._data)

    # ---- internal helpers ------------------------------------------

    def _swap(self, i, j):
        self._data[i], self._data[j] = self._data[j], self._data[i]

    def _sift_up(self, idx):
        """Move element at *idx* up until the heap property is restored."""
        while idx > 0:
            parent = (idx - 1) // 2
            if self._data[idx] < self._data[parent]:
                self._swap(idx, parent)
                idx = parent
            else:
                break

    def _sift_down(self, idx):
        """Move element at *idx* down until the heap property is restored."""
        size = len(self._data)
        while True:
            smallest = idx
            left = 2 * idx + 1
            right = 2 * idx + 2

            if left < size and self._data[left] < self._data[smallest]:
                smallest = left
            if right < size and self._data[right] < self._data[smallest]:
                smallest = right

            if smallest != idx:
                self._swap(idx, smallest)
                idx = smallest
            else:
                break


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
    # (cost, current, tot_time, tot_dist, tot_price)
    heap.push((0, start_iata, 0, 0, 0))
    best_costs = {start_iata: 0}
    predecessors = {start_iata: None}
    nodes_explored = 0

    while heap:
        cost, current, tot_time, tot_dist, tot_price = heap.pop()

        if cost > best_costs.get(current, float('inf')):
            continue
        nodes_explored += 1

        if current == end_iata:
            elapsed = (time.time() - t_start) * 1000
            print(f"  [DIJKSTRA] Route FOUND! Explored {nodes_explored} nodes in {elapsed:.2f}ms")
            path = _reconstruct_path(predecessors, end_iata)
            return path, tot_time, tot_dist, tot_price

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if criteria == 'time':
                    weight = dur
                elif criteria == 'distance':
                    weight = dist
                elif criteria == 'price':
                    weight = price
                elif criteria == 'connections':
                    weight = 1
                else:
                    weight = dur

                new_cost = cost + weight
                if new_cost < best_costs.get(neighbor, float('inf')):
                    best_costs[neighbor] = new_cost
                    predecessors[neighbor] = current
                    heap.push((
                        new_cost,
                        neighbor,
                        tot_time + dur,
                        round(tot_dist + dist, 2),
                        round(tot_price + price, 2)
                    ))

    elapsed = (time.time() - t_start) * 1000
    print(f"  [DIJKSTRA] No route found after exploring {nodes_explored} nodes in {elapsed:.2f}ms")
    return None, 0, 0, 0


def dijkstra_for_yens(start_iata, end_iata, ignored_nodes, ignored_edges, criteria='price'):
    """Modified Dijkstra for Yen's Algorithm that ignores specific nodes and edges."""
    heap = MinHeap()
    heap.push((0, start_iata, 0, 0, 0))
    best_costs = {start_iata: 0}
    predecessors = {start_iata: None}

    while heap:
        cost, current, tot_time, tot_dist, tot_price = heap.pop()

        if current == end_iata:
            path = _reconstruct_path(predecessors, end_iata)
            return path, tot_time, tot_dist, tot_price

        if cost > best_costs.get(current, float('inf')):
            continue

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor in ignored_nodes:
                    continue
                if (current, neighbor) in ignored_edges:
                    continue

                if criteria == 'time':
                    weight = dur
                elif criteria == 'distance':
                    weight = dist
                elif criteria == 'price':
                    weight = price
                else:
                    weight = price

                new_cost = cost + weight
                if new_cost < best_costs.get(neighbor, float('inf')):
                    best_costs[neighbor] = new_cost
                    predecessors[neighbor] = current
                    heap.push((
                        new_cost, neighbor,
                        tot_time + dur, tot_dist + dist, tot_price + price
                    ))
    return None, 0, 0, 0

