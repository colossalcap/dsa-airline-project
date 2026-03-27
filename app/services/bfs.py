"""
Breadth-First Search (BFS) service for flight routing.

This module implements a highly optimized BFS algorithm to find all reachable 
airports within a given number of maximum flight stops. 

Performance Note:
Instead of using Python's built-in `list` (which has O(n) time complexity for 
removing from the front) or importing `collections.deque` , this implementation uses an Unrolled Linked List (`BlockQueue`). 
This provides O(1) time complexity for queue operations while maximizing CPU cache 
locality and minimizing memory allocation overhead.
"""
from app.services.data_store import flight_graph, airport_names


class _BlockNode:
    """
    A node that holds a fixed-size block (array) of elements.
    Multiple _BlockNodes link together to form the BlockQueue.
    """
    
    # Using __slots__ prevents Python from creating a dynamic dictionary (__dict__) 
    # for every instance. This drastically reduces the memory footprint when 
    # hundreds or thousands of blocks are created during a massive BFS search.
    __slots__ = ('elements', 'next', 'head_idx', 'tail_idx')

    def __init__(self, block_size):
        # Pre-allocate a list with `None` to simulate a fixed-size contiguous array.
        # This avoids the overhead of dynamically resizing lists in Python.
        self.elements = [None] * block_size
        
        # Pointer to the next block in the linked list chain
        self.next = None
        
        # head_idx represents the "read" pointer. It points to the next item to be dequeued.
        self.head_idx = 0  
        
        # tail_idx represents the "write" pointer. It points to the next empty slot for enqueuing.
        self.tail_idx = 0  

    def is_full(self):
        """
        Returns True if the block cannot accept more elements.
        Because we don't shift elements down when dequeuing (for performance), 
        a block is considered 'full' when the write pointer hits the end of the array,
        even if earlier slots have been read and are now empty.
        """
        return self.tail_idx == len(self.elements)

    def is_empty(self):
        """
        Returns True if all elements that were written to this block have been read.
        When the read pointer catches up to the write pointer, the block is effectively empty.
        """
        return self.head_idx == self.tail_idx


class BlockQueue:
    """
    A First-In-First-Out (FIFO) Queue implemented as an Unrolled Linked List.
    It combines the fast O(1) appending/popping of a Linked List with the 
    cache-friendly memory layout of an Array.
    """

    def __init__(self, block_size=64):
        # 64 is a standard choice that balances memory usage with CPU cache line efficiency.
        self.block_size = block_size
        
        # Initialize the queue with a single empty block.
        first_block = _BlockNode(self.block_size)
        
        # Both head (where we read) and tail (where we write) point to the first block initially.
        self._head_block = first_block
        self._tail_block = first_block
        
        # Keep track of the total number of valid elements currently in the queue.
        self._size = 0

    def enqueue(self, item):
        """Add an item to the back of the queue in O(1) amortized time."""
        
        # STEP 1: Check if we have room in the current tail block.
        if self._tail_block.is_full():
            # The current block is full. We must allocate a new block.
            new_block = _BlockNode(self.block_size)
            
            # Link the old tail block to the newly created block.
            self._tail_block.next = new_block
            
            # Update the queue's tail pointer to be the new block.
            self._tail_block = new_block

        # STEP 2: Insert the item into the array at the `tail_idx` position.
        self._tail_block.elements[self._tail_block.tail_idx] = item
        
        # Move the write pointer forward so the next enqueue goes to the next slot.
        self._tail_block.tail_idx += 1
        
        # Increment the total queue size.
        self._size += 1

    def dequeue(self):
        """Remove and return the item at the front of the queue in O(1) time."""
        
        # Safety check to prevent popping from an empty data structure.
        if self._size == 0:
            raise IndexError("dequeue from an empty queue")

        # STEP 1: Extract the data from the current head block at the `head_idx` position.
        data = self._head_block.elements[self._head_block.head_idx]
        
        # STEP 2: Memory Management. 
        # Overwrite the reference with `None`. If we don't do this, the queue will hold a 
        # reference to the object forever, preventing Python's Garbage Collector from freeing
        # the memory (causing a memory leak, especially bad in large graphs).
        self._head_block.elements[self._head_block.head_idx] = None 
        
        # Move the read pointer forward.
        self._head_block.head_idx += 1
        
        # Decrement the total queue size.
        self._size -= 1

        # STEP 3: Block cleanup and traversal.
        # Check if we have read all the elements present in the current head block.
        if self._head_block.is_empty():
            
            # If there is another block waiting in the chain...
            if self._head_block.next is not None:
                # Discard the current empty block and move the head pointer to the next block.
                # The old block will automatically be garbage collected by Python.
                self._head_block = self._head_block.next
            else:
                # OPTIMIZATION: If this is the ONLY block left in the queue and it's empty,
                # we don't need to throw it away and create a new one later. 
                # We can just reset the read/write pointers to 0 and reuse the array!
                self._head_block.head_idx = 0
                self._head_block.tail_idx = 0

        return data

    def __bool__(self):
        """Allows the queue to be used in truthy evaluations (e.g., `while queue:`)."""
        return self._size > 0

    def __len__(self):
        """Allows using `len(queue)` to check the current size."""
        return self._size


def find_reachable_airports_bfs(start, max_stops=2):
    """
    Performs a Breadth-First Search to find all airports reachable within `max_stops`.
    
    Args:
        start (str): The IATA code of the starting airport (e.g., 'JFK').
        max_stops (int): The maximum number of connecting flights allowed.
                         (0 stops = direct flights only, 1 stop = 1 connection, etc.)
                         
    Returns:
        dict: A mapping of {depth: [{"iata": code, "name": name}, ...]}
    """
    print(f"  [BFS] Starting BFS from '{start}' with max {max_stops} stops")

    # `reachable` stores our results. Keys are the 'depth' (number of stops), 
    # and values are lists of airport dictionaries.
    reachable = {}
    
    # `visited` is a crucial Set that tracks which airports we have already seen.
    # Sets have O(1) lookup time. This prevents infinite loops if flights are bidirectional 
    # (e.g., flying A -> B -> A -> B forever).
    visited = {start}
    
    # Metric tracking for debugging/telemetry
    nodes_dequeued = 0

    # Initialize our highly-optimized custom queue
    queue = BlockQueue()
    
    # Enqueue the starting node. We store a TUPLE of (current_airport_iata, current_depth).
    # The start node is at depth 0 (it takes 0 flights to reach where you already are).
    queue.enqueue((start, 0)) 

    # Process nodes level by level (Standard BFS traversal pattern)
    while queue:
        # Pop the oldest item from the queue
        current, depth = queue.dequeue()
        nodes_dequeued += 1

        # PRUNING / EARLY EXIT:
        # Because BFS explores level-by-level, the moment we pull a node off the queue 
        # whose depth is strictly greater than our `max_stops`, we know every subsequent 
        # node in the queue will also be past our limit. We can safely stop the entire search.
        if depth > max_stops:
            break

        # Verify the current airport actually has outgoing flights mapped in our graph
        if current in flight_graph:
            
            # Iterate through all neighbors (outgoing flight destinations)
            # The graph presumably stores tuples of (destination, duration, distance, price).
            # We use `_` to ignore duration, distance, and price since we only care about reachability here.
            for neighbor, dur, dist, price in flight_graph[current]:
                
                # If we haven't been to this destination before...
                if neighbor not in visited:
                    
                    # Mark it as visited IMMEDIATELY to prevent other paths from queuing it up again.
                    visited.add(neighbor)
                    
                    # The neighbor is one flight further away than the current node.
                    next_depth = depth + 1
                    
                    # Only record and queue this neighbor if it falls within our flight limit.
                    if next_depth <= max_stops:
                        
                        # Ensure a list exists in our dictionary for this specific depth level
                        if next_depth not in reachable:
                            reachable[next_depth] = []
                            
                        # Append the formatted airport data to the results
                        reachable[next_depth].append({
                            "iata": neighbor,
                            # Fallback to the IATA code if the full name isn't in our directory
                            "name": airport_names.get(neighbor, neighbor)
                        })
                        
                        # Put the neighbor into the queue so we can explore *its* outgoing flights later
                        queue.enqueue((neighbor, next_depth))

    # Log completion metrics
    print(f"  [BFS] Dequeued {nodes_dequeued} nodes, visited {len(visited)} airports")
    
    return reachable