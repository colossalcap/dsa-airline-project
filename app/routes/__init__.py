from app.routes.main import main_bp
from app.routes.api import api_bp


def register_routes(app):
    """Register all route blueprints with the Flask app."""
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
