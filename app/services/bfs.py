import time
from app.services.data_store import flight_graph, airport_names


class _BlockNode:
    """A node that holds a fixed-size block of elements."""
    __slots__ = ('elements', 'next', 'head_idx', 'tail_idx')

    def __init__(self, block_size):
        # Pre-allocate a list to simulate a fixed-size array
        self.elements = [None] * block_size
        self.next = None
        # Indices to track where we are reading and writing within this specific block
        self.head_idx = 0  
        self.tail_idx = 0  

    def is_full(self):
        """Returns True if the block cannot accept more elements."""
        return self.tail_idx == len(self.elements)

    def is_empty(self):
        """Returns True if all elements in this block have been dequeued."""
        return self.head_idx == self.tail_idx


class BlockQueue:
    """FIFO Queue implemented with a block-linked list (Unrolled Linked List)."""

    def __init__(self, block_size=64):
        self.block_size = block_size
        first_block = _BlockNode(self.block_size)
        self._head_block = first_block
        self._tail_block = first_block
        self._size = 0

    def enqueue(self, item):
        """Add an item to the back of the queue in O(1) amortized time."""
        # If the current tail block is full, we need a new one
        if self._tail_block.is_full():
            new_block = _BlockNode(self.block_size)
            self._tail_block.next = new_block
            self._tail_block = new_block

        # Insert the item and move the tail index forward
        self._tail_block.elements[self._tail_block.tail_idx] = item
        self._tail_block.tail_idx += 1
        self._size += 1

    def dequeue(self):
        """Remove and return the item at the front of the queue in O(1) time."""
        if self._size == 0:
            raise IndexError("dequeue from an empty queue")

        # Extract the data using the head_idx
        data = self._head_block.elements[self._head_block.head_idx]
        
        # Nullify the reference to help Python's Garbage Collector free memory
        self._head_block.elements[self._head_block.head_idx] = None 
        self._head_block.head_idx += 1
        self._size -= 1

        # Check if we have exhausted the current head block
        if self._head_block.is_empty():
            if self._head_block.next is not None:
                # Move to the next block
                self._head_block = self._head_block.next
            else:
                # Optimization: If this is the ONLY block and it's now empty, 
                # just reset the indices instead of creating a new block later.
                self._head_block.head_idx = 0
                self._head_block.tail_idx = 0

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

    queue = BlockQueue()
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
