import sys
from flask import Flask
from utils.data_store import load_flight_data, build_sorted_iata_list
from routes import main_bp

sys.setrecursionlimit(10000)
sys.stdout = sys.stderr  # Ensure prints appear alongside Flask debug output

# Initialize Flask app
app = Flask(__name__)
app.register_blueprint(main_bp)

# Load data on startup
load_flight_data()
build_sorted_iata_list()

if __name__ == '__main__':
    # Run the Flask server
    app.run(debug=True, port=5000)
