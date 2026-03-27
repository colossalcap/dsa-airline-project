"""
Sorting service.
Provides implementations of sorting algorithms, such as a custom Quick Sort,
useful for ranking query results.
"""
import random
import time


def quick_sort(arr, key_func):
    """Quick Sort implementation using randomized pivot (Lomuto partition)."""
    partition_count = [0]
    comparison_count = [0]

    def _partition(items, low, high):
        rand_idx = random.randint(low, high)
        # Swap random pivot to the end
        items[rand_idx], items[high] = items[high], items[rand_idx]

        pivot = key_func(items[high])
        i = low - 1  # i will keep track of the boundary for elements smaller than the pivot
        
        for j in range(low, high):
            comparison_count[0] += 1
            if key_func(items[j]) <= pivot:
                i += 1
                items[i], items[j] = items[j], items[i]
                
        # Move the pivot to its correct sorted position
        items[i + 1], items[high] = items[high], items[i + 1]
        partition_count[0] += 1
        return i + 1

    def _quick_sort_recursive(items, low, high):
        """Recursively partition and sort the segments."""
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
