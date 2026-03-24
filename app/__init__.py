import sys
from flask import Flask

sys.setrecursionlimit(10000)


def create_app():
    """Application factory — creates and configures the Flask app."""
    app = Flask(__name__)

    # Register route blueprints
    from app.routes import register_routes
    register_routes(app)

    # Load flight data into the global graph on startup
    from app.services.data_store import load_flight_data
    load_flight_data()

    return app
