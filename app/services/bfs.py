import time
from app.services.data_store import flight_graph, airport_names


class _Node:
    """Internal node for the linked-list based Queue."""
    __slots__ = ('data', 'next')

    def __init__(self, data):
        self.data = data
        self.next = None


class Queue:
    """FIFO Queue implemented with a singly-linked list.

    Provides O(1) enqueue and O(1) dequeue without relying on
    collections.deque or any other library data structure.
    """

    def __init__(self):
        self._head = None
        self._tail = None
        self._size = 0

    def enqueue(self, item):
        """Add an item to the back of the queue."""
        new_node = _Node(item)
        if self._tail is not None:
            self._tail.next = new_node
        self._tail = new_node
        if self._head is None:
            self._head = new_node
        self._size += 1

    def dequeue(self):
        """Remove and return the item at the front of the queue.

        Raises IndexError if the queue is empty.
        """
        if self._head is None:
            raise IndexError("dequeue from an empty queue")
        data = self._head.data
        self._head = self._head.next
        if self._head is None:
            self._tail = None
        self._size -= 1
        return data

    def __bool__(self):
        return self._size > 0

    def __len__(self):
        return self._size


def find_reachable_airports_bfs(start, max_stops=2):
    """BFS to find all airports reachable within a given number of stops."""
    print(f"  [BFS] Starting BFS from '{start}' with max {max_stops} stops")
    t_start = time.time()

    reachable = {}
    visited = {start}
    nodes_dequeued = 0

    queue = Queue()
    queue.enqueue((start, 0))

    while queue:
        current, depth = queue.dequeue()
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
                        queue.enqueue((neighbor, next_depth))

    elapsed = (time.time() - t_start) * 1000
    total_found = sum(len(v) for v in reachable.values())
    print(f"  [BFS] Dequeued {nodes_dequeued} nodes, visited {len(visited)} airports")
    return reachable
