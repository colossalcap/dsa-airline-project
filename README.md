# ✈️ DSA Airline Flight Path Finder

A Flask-based web application that finds optimal flight routes between airports using classic Data Structures & Algorithms — including **Dijkstra's Algorithm**, **Yen's K-Shortest Paths**, **BFS Reachability**, and **QuickSort**.

---

## 📁 Project Structure

```
dsa-airline-project/
├── RunApp.py                     # Entry point (calls the app factory)
├── requirements.txt
├── README.md
├── .gitignore
├── app/                          # Flask application package
│   ├── __init__.py               # App factory: create_app()
│   ├── routes/                   # Route handlers
│   │   ├── __init__.py           # Blueprint registration
│   │   ├── main.py               # Home page route (/)
│   │   └── api.py                # All /api/* endpoints
│   ├── services/                 # Core DSA logic
│   │   ├── __init__.py
│   │   ├── data_store.py         # Data loading & graph storage
│   │   ├── sorting.py            # QuickSort
│   │   ├── dijkstra.py           # Dijkstra's Algorithm
│   │   ├── yen.py                # Yen's K-Shortest Paths
│   │   ├── bfs.py                # BFS Reachability
│   │   └── multi_city.py         # Multi-city route planning
│   ├── templates/
│   │   └── home.html             # Frontend HTML page
│   └── static/
│       ├── style.css             # Frontend styles
│       ├── map/                  # Leaflet map assets
│       └── js/                   # Modular frontend JavaScript (ES modules)
│           ├── main.js           # Entry point: imports, window bindings, init
│           ├── state.js          # Centralized shared mutable state
│           ├── utils.js          # Pure utilities (animation, math, IATA parsing)
│           ├── map.js            # Leaflet map initialization & rendering
│           ├── ui.js             # Dark mode, panel switching, collapse/float
│           ├── optimalRoute.js   # Panel 1: Dijkstra optimal route search
│           ├── altRoutes.js      # Panel 2: Yen's alternative routes
│           ├── reachability.js   # Panel 3: BFS reachability map
│           ├── multiCity.js      # Panel 4: Multi-city route planner
│           └── routeDetails.js   # Panel 5: Detailed route timeline view
|
├── scripts/
│   ├── BFS_benchmarking/             # BFS algorithm performance tests
│   ├── Dijkstra_benchmarking/        # Dijkstra algorithm performance tests
│   └── setup_run.py                  # Dependency checker & launcher
├── data/
│   └── airline_routes.json       # Airport and route dataset
├── utils/                        # Utility scripts (Python)
└── venv/                         # Virtual environment (not committed)
```

---

## 🛠️ Prerequisites

Before setting up the project, make sure you have the following installed:

| Requirement    | Minimum Version | How to Check             | Download Link                          |
|----------------|-----------------|--------------------------|----------------------------------------|
| **Python**     | 3.10+           | `python --version`       | https://www.python.org/downloads/      |
| **pip**        | 22.0+           | `pip --version`          | Comes bundled with Python              |
| **Git**        | Any             | `git --version`          | https://git-scm.com/downloads          |

> **Windows users:** During Python installation, make sure to check **"Add Python to PATH"**. If you skip this, the `python` and `pip` commands won't work in your terminal.

---

## 🚀 Installation (Step-by-Step)


### 1. Create a Virtual Environment

A virtual environment keeps this project's dependencies isolated from your system Python.

**Windows (Command Prompt):**
```cmd
python -m venv venv
venv\Scripts\activate
```

**Windows (PowerShell):**
```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

> **PowerShell Execution Policy Error?** If you see an error like *"cannot be loaded because running scripts is disabled"*, run this command first and then try again:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

Once activated, your terminal prompt will show `(venv)` at the beginning, like this:
```
(venv) C:\Users\you\dsa-airline-project>
```

### 2. Install Dependencies

With the virtual environment **activated**, install all required packages:

```bash
pip install -r requirements.txt
```

This installs Flask and all its dependencies. You should see output ending with `Successfully installed ...`.

### 3. Verify the Data File Exists

The application requires the flight data file at:
```
data/airline_routes.json
```

This file should already be included in the repository. If it's missing, the app will print `JSON file not found` on startup and no routes will work.

---

## ▶️ Running the Application

### 1. Activate the Virtual Environment (if not already active)

**Windows (CMD):**
```cmd
venv\Scripts\activate
```

**Windows (PowerShell):**
```powershell
venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
source venv/bin/activate
```

### 2. Start the Flask Server

```bash
python RunApp.py
```

You should see output similar to:

```
Loaded 3425 airports with cleaned formatting.
 * Serving Flask app 'main'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

### 3. Open the Application

Open your web browser and navigate to:

```
http://127.0.0.1:5000
```

or equivalently:

```
http://localhost:5000
```

### 4. Stop the Server

Press `Ctrl + C` in the terminal to stop the Flask server.


## 📖 Algorithms Overview

| Algorithm | Function | Purpose |
|---|---|---|
| **Quick Sort** | `quick_sort()` | Sorts airport options alphabetically using randomized Lomuto partition |
| **Dijkstra's Algorithm** | `find_optimal_route()` | Finds the single optimal route by time, distance, price, or connections |
| **Yen's K-Shortest Paths** | `find_alternative_routes_yens()` | Finds up to K alternative routes sorted by price |
| **BFS** | `find_reachable_airports_bfs()` | Discovers all airports reachable within N stops |
| **Multi-City Dijkstra** | `plan_multi_city_route()` | Chains Dijkstra calls to build a route through multiple cities |

---

## ❓ FAQ / Troubleshooting

### `python` command not found / not recognized

**Cause:** Python is not added to your system PATH.

**Fix:**
- **Windows:** Reinstall Python from https://www.python.org/downloads/ and check the box **"Add Python to PATH"** on the first screen of the installer.
- **macOS/Linux:** Try using `python3` instead of `python`. If that doesn't work, install Python via your package manager (e.g. `brew install python3` on macOS).

---

### `pip install -r requirements.txt` fails with a permissions error

**Cause:** You're installing packages globally without admin/root privileges.

**Fix:** Make sure you've activated the virtual environment first. Your prompt should show `(venv)`. If you skipped creating the venv, go back to [Installation Step 2](#2-create-a-virtual-environment).

---

### PowerShell says "running scripts is disabled on this system"

**Cause:** PowerShell's execution policy blocks the `Activate.ps1` script.

**Fix:** Run this once in PowerShell (as your regular user, no admin needed):
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try activating the venv again.

---

### `ModuleNotFoundError: No module named 'flask'`

**Cause:** Either the virtual environment is not activated, or Flask was not installed.

**Fix:**
1. Activate the venv (see [Running Step 1](#1-activate-the-virtual-environment-if-not-already-active)).
2. Re-run `pip install -r requirements.txt`.
3. Confirm Flask is installed: `pip list | findstr Flask` (Windows) or `pip list | grep Flask` (macOS/Linux).

---

### The app starts but shows "JSON file not found"

**Cause:** The data file `data/airline_routes.json` is missing or the working directory is wrong.

**Fix:**
1. Check that the file exists: `dir data\` (Windows) or `ls data/` (macOS/Linux). You should see `airline_routes.json`.
2. Make sure you're running `python RunApp.py` from inside the `dsa-airline-project/` directory, **not** from a parent or child folder.

---

### The page loads but nothing happens when I search for routes

**Cause:** The Flask server might not be running, or the browser is pointing to the wrong URL.

**Fix:**
1. Confirm the server is running — your terminal should show `* Running on http://127.0.0.1:5000`.
2. Open `http://127.0.0.1:5000` (not a file path like `file:///C:/...`).
3. Open the browser's Developer Tools (F12) → Console tab to check for JavaScript errors.

---

### `RecursionError: maximum recursion depth exceeded`

**Cause:** The Quick Sort algorithm may hit Python's default recursion limit on very large datasets.

**Fix:** The app already sets `sys.setrecursionlimit(10000)` in `app/__init__.py`. If you still hit this error, you can increase the value, but be cautious — very large values can cause a stack overflow crash.



### Port 5000 is already in use

**Cause:** Another application (or a previous instance of this app) is already using port 5000. On macOS, AirPlay Receiver sometimes occupies port 5000.

**Fix:**
- **Option A:** Stop the other process using port 5000.
  - Windows: `netstat -ano | findstr :5000` to find the PID, then `taskkill /PID <pid> /F`.
  - macOS/Linux: `lsof -i :5000` then `kill <pid>`.
- **Option B:** Change the port in `RunApp.py`:
  ```python
  app.run(debug=True, port=5001)  # use a different port
  ```